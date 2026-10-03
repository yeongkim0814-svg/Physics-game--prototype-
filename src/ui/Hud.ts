import type { Renderable } from '../engine/GameEngine';
import { Player } from '../player/Player';
import type { ResourceManager } from '../resource/ResourceManager';

const CSS = `
#hud { position: fixed; left: max(16px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top));
  z-index: 1; pointer-events: none; font: 600 14px/1.3 system-ui, sans-serif; color: #e8f6ff; text-shadow: 0 1px 3px #000; }
#hud .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
#hud .bar { position: relative; width: 170px; height: 14px; border-radius: 7px; overflow: hidden;
  background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.35); }
#hud .fill { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg,#1fb6ff,#7df9ff); }
#hud .bar.low .fill { background: linear-gradient(90deg,#ff5a4a,#ffb13b); }
#hud .bar.flash { box-shadow: 0 0 12px 3px rgba(125,249,255,.9); }
#hud .bar { transition: box-shadow .25s; }
#hud-pop { position: fixed; left: 50%; top: 38%; z-index: 1; pointer-events: none; transform: translateX(-50%);
  font: 700 28px system-ui, sans-serif; color: #7df9ff; text-shadow: 0 2px 6px #000; opacity: 0; }
#hud-pop.large { color: #ffb13b; font-size: 34px; }
#hud-pop.show { animation: hudpop .8s ease-out forwards; }
@keyframes hudpop { 0% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -40px); } }
`;

/** 에너지와 수집 현황. DOM을 직접 만든다 — 값이 바뀔 때만 DOM을 건드려 모바일에서 비용을 아낀다. */
export class Hud implements Renderable {
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly energyText: HTMLElement;
  private readonly resText: HTMLElement;
  private readonly pop: HTMLElement;
  private lastEnergy = -1;
  private lastCollected = -1;
  private flashUntil = 0;

  constructor(
    private readonly player: Player,
    private readonly resources: ResourceManager,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="row"><span>⚡</span><div class="bar"><div class="fill"></div></div><span id="hud-energy"></span></div>
      <div class="row"><span>◆</span><span id="hud-res"></span></div>`;
    document.body.appendChild(root);

    this.pop = document.createElement('div');
    this.pop.id = 'hud-pop';
    document.body.appendChild(this.pop);

    this.bar = root.querySelector('.bar')!;
    this.fill = root.querySelector('.fill')!;
    this.energyText = root.querySelector('#hud-energy')!;
    this.resText = root.querySelector('#hud-res')!;

    // 시작 안내 오버레이가 HUD를 가리지 않도록 오버레이를 HUD 위로 올린다.
    const hint = document.getElementById('hint');
    if (hint) hint.style.zIndex = '10';
  }

  render(_alpha: number): void {
    const e = Math.round(this.player.energy);
    if (e !== this.lastEnergy) {
      this.lastEnergy = e;
      this.fill.style.width = `${(this.player.energy / Player.MAX_ENERGY) * 100}%`;
      this.energyText.textContent = `${e}/${Player.MAX_ENERGY}`;
      // 25% 미만이면 색을 바꿔 "곧 스킬을 못 쓴다"는 경고를 준다.
      this.bar.classList.toggle('low', e < Player.MAX_ENERGY * 0.25);
    }

    const c = this.resources.collectedCount;
    if (c !== this.lastCollected) {
      this.lastCollected = c;
      this.resText.textContent = `자원 ${c}/${this.resources.total}`;
    }

    for (const ev of this.resources.drainEvents()) {
      // 가득 차서 0만 채워진 경우도 있으므로, 실제로 채워진 양을 보여준다(상한 때문에 버려진 양을 숨기지 않는다).
      this.pop.textContent = ev.gained > 0 ? `+${ev.gained}` : 'MAX';
      this.pop.className = ev.kind === 'large' ? 'large' : '';
      void this.pop.offsetWidth; // 애니메이션 재시작을 위한 리플로우
      this.pop.classList.add('show');
      this.bar.classList.add('flash');
      this.flashUntil = performance.now() + 250;
    }
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.bar.classList.remove('flash');
      this.flashUntil = 0;
    }
  }
}
