/** 키보드 상태 + 포인터락 마우스 델타. 로직은 상태를 "읽기만" 한다. */
export class Input {
  private readonly keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  locked = false;

  constructor(private readonly lockTarget: HTMLElement, hint: HTMLElement) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // 포커스를 잃으면 keyup을 못 받아 키가 "눌린 채" 남는 버그 방지.
    window.addEventListener('blur', () => this.keys.clear());

    hint.addEventListener('click', () => this.lockTarget.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      hint.classList.toggle('hidden', this.locked);
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** 누적된 마우스 이동량을 꺼내고 0으로 리셋. */
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }
}
