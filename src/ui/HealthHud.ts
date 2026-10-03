import type { Renderable } from '../engine/GameEngine';
import type { EnemyManager } from '../enemy/EnemyManager';
import { Player } from '../player/Player';

const CSS = `
#hud .bar.hp .fill { background: linear-gradient(90deg, #8a2f1f, var(--bad)); }
#hud .bar.hp.low { animation: hpblink .5s steps(2) infinite; }
@keyframes hpblink { 50% { box-shadow: 0 0 10px 2px rgba(192,69,46,.9); } }
#alert-badge { position: fixed; left: 50%; top: max(10px, env(safe-area-inset-top)); transform: translateX(-50%); z-index: 1;
  pointer-events: none; font: 700 15px var(--font); letter-spacing: 1px; padding: 4px 10px; border: 2px solid; display: none;
  background: var(--panel); text-shadow: 0 0 6px rgba(255,140,30,.45); }
#alert-badge.l1 { color: var(--amber); border-color: var(--amber); }
#alert-badge.l2 { color: var(--bad); border-color: var(--bad); animation: hpblink .5s steps(2) infinite; }
#hit-flash { position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0;
  background: radial-gradient(circle, rgba(192,69,46,0) 25%, rgba(192,69,46,.75) 100%); }
#hit-flash.on { animation: hitflash .5s ease-out; }
@keyframes hitflash { 0% { opacity: 1; } 100% { opacity: 0; } }
#death { position: fixed; inset: 0; z-index: 20; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(13,15,10,.78); color: var(--bad); font: 700 26px var(--font); text-align: center; }
#death.on { display: flex; }
#death small { color: var(--text); font-size: 14px; font-weight: 400; }
#death button { font: inherit; font-size: 16px; color: var(--amber); background: transparent; border: 2px solid var(--amber-dim);
  border-radius: 0; padding: 10px 18px; cursor: pointer; touch-action: manipulation; }
#death button:active { background: var(--amber); color: var(--bg); }
`;

/** 체력 바, 경계 표시, 피격 번쩍임, 사망 화면. Hud(에너지)와 책임을 나눠 한 파일이 비대해지지 않게 했다. */
export class HealthHud implements Renderable {
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly text: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly death: HTMLElement;
  private lastHp = -1;
  private lastAlert = -1;
  private deadShown = false;

  constructor(
    private readonly player: Player,
    private readonly enemies: EnemyManager,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Hud가 만든 #hud 컨테이너에 같은 행 스타일로 끼워 넣는다(레이아웃·테마 일관성).
    const root = document.getElementById('hud')!;
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span>♥</span><div class="bar hp"><div class="fill"></div></div><span class="hp-text"></span>';
    root.insertBefore(row, root.firstChild);
    this.bar = row.querySelector('.bar')!;
    this.fill = row.querySelector('.fill')!;
    this.text = row.querySelector('.hp-text')!;

    this.badge = document.createElement('div');
    this.badge.id = 'alert-badge';
    document.body.appendChild(this.badge);

    this.hit = document.createElement('div');
    this.hit.id = 'hit-flash';
    document.body.appendChild(this.hit);

    this.death = document.createElement('div');
    this.death.id = 'death';
    this.death.innerHTML = '신호 소실<small>체력이 모두 소진되었습니다</small><button type="button">다시 시작</button>';
    // pointerdown에서 전파를 막아야 Input의 터치 핸들러(시점/스틱)가 이 탭을 가로채지 않는다.
    const btn = this.death.querySelector('button')!;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => location.reload());
    document.body.appendChild(this.death);
  }

  render(_alpha: number): void {
    const hp = Math.ceil(this.player.health);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.fill.style.width = `${(this.player.health / Player.MAX_HEALTH) * 100}%`;
      this.text.textContent = `${hp}/${Player.MAX_HEALTH}`;
      this.bar.classList.toggle('low', hp <= Player.MAX_HEALTH * 0.3);
    }

    const lvl = this.enemies.alertLevel();
    if (lvl !== this.lastAlert) {
      this.lastAlert = lvl;
      this.badge.style.display = lvl ? 'block' : 'none';
      this.badge.className = lvl === 2 ? 'l2' : 'l1';
      this.badge.textContent = lvl === 2 ? '!! 추격 중' : '? 의심';
    }

    for (const ev of this.enemies.drainEvents()) {
      if (ev.type === 'hurt') {
        this.hit.className = '';
        void this.hit.offsetWidth; // 애니메이션 재시작
        this.hit.className = 'on';
      }
    }

    if (this.player.dead && !this.deadShown) {
      this.deadShown = true;
      // 데스크톱은 포인터 락 상태라 버튼을 누르려면 먼저 풀어야 한다.
      document.exitPointerLock?.();
      this.death.classList.add('on');
      // 사망 화면 뒤로 스킬 안내/경계 표시가 비치지 않게 숨긴다.
      for (const id of ['hud-prompt', 'alert-badge']) document.getElementById(id)?.style.setProperty('display', 'none', 'important');
    }
  }
}
