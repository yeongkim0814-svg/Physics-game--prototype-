const CSS = `
.ui-btn { position: fixed; z-index: 2; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 2px solid rgba(255,255,255,.5); background: rgba(80,140,255,.22); color: #fff; text-align: center;
  font: 700 14px/1.2 system-ui, sans-serif; touch-action: none; user-select: none; }
body:not(.playing) .ui-btn { display: none; }
.ui-btn.ready { background: rgba(80,200,255,.5); box-shadow: 0 0 14px 2px rgba(125,249,255,.8); }
.ui-btn.disabled { opacity: .45; }
#skill-tunnel { right: max(24px, env(safe-area-inset-right)); bottom: max(28px, env(safe-area-inset-bottom)); width: 88px; height: 88px; }
`;

/**
 * 스킬 발동 입력(PC: E 키, 터치: 우하단 버튼). "눌림"을 한 번만 소비하게 해서
 * 키를 꾹 눌러도 매 프레임 발동되지 않고, 쿨다운 중 눌러 둔 입력이 나중에 터지지도 않게 한다.
 */
export class SkillInput {
  private pressed = false;
  private readonly button: HTMLElement | null = null;

  constructor(isTouch: boolean) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) this.pressed = true;
    });
    if (isTouch) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      const btn = document.createElement('div');
      btn.id = 'skill-tunnel';
      // Input의 터치 핸들러가 이 버튼을 시점 드래그로 오인하지 않도록 .ui-btn으로 표시한다.
      btn.className = 'ui-btn';
      btn.innerHTML = '터널링<br />⇢|⇢';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.pressed = true;
      });
      document.body.appendChild(btn);
      this.button = btn;
    }
  }

  consumePressed(): boolean {
    const p = this.pressed;
    this.pressed = false;
    return p;
  }

  /** 대상이 사거리 안에 있고 발동 가능할 때 버튼을 강조해 "지금 쓸 수 있다"를 알린다. */
  setState(ready: boolean, disabled: boolean): void {
    this.button?.classList.toggle('ready', ready);
    this.button?.classList.toggle('disabled', disabled);
  }
}
