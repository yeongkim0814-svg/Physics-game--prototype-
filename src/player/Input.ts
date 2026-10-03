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
  private sprintLocked = false;
  private stickLastDir = { x: 0, z: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  private readonly stickBase = document.getElementById('stick-base')!;
  private readonly stickKnob = document.getElementById('stick-knob')!;

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
      if (!this.locked) this.keys.clear();
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
    e.preventDefault();

    // 화면 좌/우 절반으로 역할을 나눈다. 멀티터치로 이동+시점을 동시에 쓸 수 있다.
    if (e.clientX < window.innerWidth / 2) {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      // 플로팅 스틱: 손가락이 처음 닿은 곳이 중심. 고정 위치보다 엄지 위치 편차에 강하다.
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      // 스프린트 잠금 리셋: 새 터치는 이전 상태를 지운다.
      this.sprintLocked = false;
      this.stickLastDir = { x: 0, z: 0 };
      this.stickKnob.classList.remove('locked');
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
      const LOCK = 0.97;
      const raw = Math.min(len / Input.STICK_RADIUS, 1);

      // 스프린트 잠금: raw >= 0.97이면 locked 상태로 진입한다.
      if (raw >= LOCK) {
        this.sprintLocked = true;
      }

      let mag = Math.max(0, Math.min(1, (raw - DEAD) / (FULL - DEAD)));

      // 잠금 중: 크기는 1로 고정.
      if (this.sprintLocked) {
        mag = 1;
      }

      // 방향: deadzone > raw일 때는 마지막 방향 유지(시선 정조준 안 흔들린다).
      // 아니면 현재 엄지 방향을 따른다.
      if (len > 0 && raw > DEAD) {
        const dirX = dx / len;
        const dirY = dy / len;
        this.stickLastDir.x = dirX;
        this.stickLastDir.z = dirY;
      }

      this.stick.x = this.stickLastDir.x * mag;
      this.stick.z = this.stickLastDir.z * mag;

      // 노브 시각: 반경 밖으로 끌어도 원 위에 머문다. 잠금 중에는 엄지 위치와 무관하게
      // 마지막 방향의 반경 위에 고정해, "잠겼다"는 상태가 화면에서 읽히게 한다.
      let knobDx = dx;
      let knobDy = dy;
      if (this.sprintLocked) {
        knobDx = this.stickLastDir.x * Input.STICK_RADIUS;
        knobDy = this.stickLastDir.z * Input.STICK_RADIUS;
      } else if (len > Input.STICK_RADIUS) {
        knobDx = (dx / len) * Input.STICK_RADIUS;
        knobDy = (dy / len) * Input.STICK_RADIUS;
      }

      // 잠금 UI 표시/제거.
      this.stickKnob.classList.toggle('locked', this.sprintLocked);

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
      this.stick.x = 0;
      this.stick.z = 0;
      this.sprintLocked = false;
      this.stickKnob.classList.remove('locked');
      this.stickBase.style.display = 'none';
      this.stickKnob.style.display = 'none';
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

  /** 정규화된 이동 입력. 키보드는 대각선이 √2배 빨라지지 않도록 길이 1로 맞춘다. */
  getMove(): MoveVector {
    if (this.isTouch) return { x: this.stick.x, z: this.stick.z };
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
}
