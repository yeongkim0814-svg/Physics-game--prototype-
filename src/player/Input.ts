export interface MoveVector {
  /** 오른쪽 +, 왼쪽 -. 크기는 0~1로 제한(아날로그 스틱이면 기울기만큼 느리게 걷는다). */
  x: number;
  /** 뒤 +, 앞 -. */
  z: number;
}

/**
 * 키보드/마우스(PC)와 터치(태블릿·폰) 입력을 한 인터페이스로 합친다.
 * 왜 합치나: Player는 "이동 벡터 + 시점 델타 + 달리기 여부"만 알면 되고,
 * 입력 장치가 늘어도(게임패드 등) Player를 건드리지 않게 하려는 것.
 */
export class Input {
  readonly isTouch = window.matchMedia('(pointer: coarse)').matches;

  private static readonly STICK_RADIUS = 60;
  // 터치 시점 감도는 마우스(px 단위가 작음)보다 커야 손가락 한 번 쓸어서 충분히 돈다.
  private static readonly TOUCH_LOOK_SCALE = 1.8;

  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  locked = false;

  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private readonly stick: MoveVector = { x: 0, z: 0 };
  private autoRun = false;
  private autoRunArmed = false;
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  private readonly stickBase = document.getElementById('stick-base')!;
  private readonly stickKnob = document.getElementById('stick-knob')!;
  private readonly runIcon = document.getElementById('run-icon')!;
  private readonly autorunBadge = document.getElementById('autorun-badge')!;

  constructor(private readonly lockTarget: HTMLElement, private readonly hint: HTMLElement) {
    document.body.classList.toggle('touch', this.isTouch);
    if (this.isTouch) this.initTouch();
    else this.initDesktop();
  }

  private initDesktop(): void {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 포커스를 잃으면 keyup을 못 받아 키가 "눌린 채" 남는 버그 방지.
    window.addEventListener('blur', () => this.keys.clear());

    this.hint.addEventListener('click', () => this.lockTarget.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      this.hint.classList.toggle('hidden', this.locked);
      if (!this.locked) {
        this.keys.clear();
        // 락이 해제되면 자동 달리기 취소.
        this.autoRun = false;
        this.updateAutorunBadge();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  private initTouch(): void {
    this.hint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.locked = true;
      this.hint.classList.add('hidden');
      document.body.classList.add('playing');
      this.autoRun = false;
      this.updateAutorunBadge();
      this.tryFullscreenLandscape();
    });

    // 길게 누르기 컨텍스트 메뉴 차단(이미지/링크가 없어도 일부 브라우저가 띄운다).
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerEnd);
    window.addEventListener('pointercancel', this.onPointerEnd);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.locked || e.pointerType === 'mouse') return;
    // UI 버튼 클릭 무시.
    if ((e.target as Element).closest('.ui-btn')) return;
    e.preventDefault();

    // 화면 좌/우 절반으로 역할을 나눈다. 멀티터치로 이동+시점을 동시에 쓸 수 있다.
    if (e.clientX < window.innerWidth / 2) {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      // 플로팅 스틱: 손가락이 처음 닿은 곳이 중심. 고정 위치보다 엄지 위치 편차에 강하다.
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      // 새 스틱 터치는 자동 달리기 해제.
      this.autoRun = false;
      this.autoRunArmed = false;
      this.updateAutorunBadge();
      this.showStick(e.clientX, e.clientY, e.clientX, e.clientY);
    } else {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      e.preventDefault();
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const len = Math.hypot(dx, dy);

      // 아날로그 입력: deadzone(엄지 편차 무시) + early saturation(끝까지 민다 = 스프린트 캐치하기 쉬움).
      const DEAD = 0.1;
      const FULL = 0.85;
      const raw = Math.min(len / Input.STICK_RADIUS, 1);

      let mag = Math.max(0, Math.min(1, (raw - DEAD) / (FULL - DEAD)));

      // 방향은 현재 엄지 방향을 따른다. deadzone 내에서도 업데이트(이전 방향 유지는 제거).
      if (len > 0) {
        const dirX = dx / len;
        const dirY = dy / len;
        this.stick.x = dirX * mag;
        this.stick.z = dirY * mag;
      } else {
        this.stick.x = 0;
        this.stick.z = 0;
      }

      // 자동 달리기 아이콘 표시 조건: 거리 >= 0.9*반경, 위쪽 방향(35도 이내).
      const ICON_THRESHOLD = 0.9;
      const ICON_ANGLE_COS = Math.cos(35 * Math.PI / 180); // ≈ 0.819
      const iconVisible = raw >= ICON_THRESHOLD && len > 0 && (-dy / len) >= ICON_ANGLE_COS;

      // 아이콘 위치(스틱 원점에서 위쪽으로 STICK_RADIUS + 55).
      const iconCenterY = this.stickOrigin.y - (Input.STICK_RADIUS + 55);
      const iconCenterX = this.stickOrigin.x;

      // 노브 시각: 아이콘 표시 중이면 STICK_RADIUS+55까지, 아니면 STICK_RADIUS까지 클램프.
      let knobDx = dx;
      let knobDy = dy;
      const maxKnobDist = iconVisible ? Input.STICK_RADIUS + 55 : Input.STICK_RADIUS;
      if (len > maxKnobDist) {
        knobDx = (dx / len) * maxKnobDist;
        knobDy = (dy / len) * maxKnobDist;
      }

      // 아이콘이 보일 때 아이콘 중심과의 거리로 armed 상태 판단.
      if (iconVisible) {
        const distToIcon = Math.hypot(dx - 0, dy - (-Input.STICK_RADIUS - 55));
        this.autoRunArmed = distToIcon <= 30;
        this.runIcon.style.left = `${iconCenterX}px`;
        this.runIcon.style.top = `${iconCenterY}px`;
        this.runIcon.style.display = 'block';
        this.runIcon.classList.toggle('active', this.autoRunArmed);
      } else {
        this.autoRunArmed = false;
        this.runIcon.style.display = 'none';
        this.runIcon.classList.remove('active');
      }

      this.showStick(this.stickOrigin.x, this.stickOrigin.y, this.stickOrigin.x + knobDx, this.stickOrigin.y + knobDy);
    } else if (e.pointerId === this.lookId) {
      e.preventDefault();
      this.mouseDX += (e.clientX - this.lookLast.x) * Input.TOUCH_LOOK_SCALE;
      this.mouseDY += (e.clientY - this.lookLast.y) * Input.TOUCH_LOOK_SCALE;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  };

  private readonly onPointerEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      // 아이콘이 armed 상태면 자동 달리기 활성화, 아니면 스틱 입력 초기화.
      if (this.autoRunArmed) {
        this.autoRun = true;
        this.updateAutorunBadge();
        this.stick.x = 0;
        this.stick.z = 0;
      } else {
        this.stick.x = 0;
        this.stick.z = 0;
      }
      this.autoRunArmed = false;
      this.stickBase.style.display = 'none';
      this.stickKnob.style.display = 'none';
      this.runIcon.style.display = 'none';
      this.runIcon.classList.remove('active');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  };

  private showStick(bx: number, by: number, kx: number, ky: number): void {
    this.stickBase.style.display = 'block';
    this.stickKnob.style.display = 'block';
    this.stickBase.style.left = `${bx}px`;
    this.stickBase.style.top = `${by}px`;
    this.stickKnob.style.left = `${kx}px`;
    this.stickKnob.style.top = `${ky}px`;
  }

  /** 전체화면+가로 고정은 지원 안 되는 브라우저(iPhone Safari 등)가 많으므로 실패해도 무시. */
  private tryFullscreenLandscape(): void {
    const el = document.documentElement;
    void el.requestFullscreen?.()
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  }

  /** 정규화된 이동 입력. 자동 달리기 중이면 앞으로만, 키보드는 대각선이 √2배 빨라지지 않도록 길이 1로 맞춘다. */
  getMove(): MoveVector {
    if (this.isTouch) {
      // 자동 달리기 중: 앞으로만 (z=-1는 앞, 터치에서는 전력 달리기).
      if (this.autoRun) return { x: 0, z: -1 };
      return { x: this.stick.x, z: this.stick.z };
    }
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyW')) z -= 1;
    if (this.keys.has('KeyS')) z += 1;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  isRunning(): boolean {
    return this.isTouch ? false : this.keys.has('ShiftLeft');
  }

  /** 누적된 시점 이동량을 꺼내고 0으로 리셋. */
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  /** 자동 달리기 배지 표시 업데이트. autoRun && body.playing일 때만 표시. */
  private updateAutorunBadge(): void {
    const shouldShow = this.autoRun && document.body.classList.contains('playing');
    this.autorunBadge.style.display = shouldShow ? 'block' : 'none';
  }
}
