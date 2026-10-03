import type { Renderable } from '../engine/GameEngine';
import { Player } from '../player/Player';
import type { ResourceManager } from '../resource/ResourceManager';
import { TUNNEL } from '../skills/TunnelingSkill';
import type { TunnelingSkill } from '../skills/TunnelingSkill';

const CSS = `
#hud { position: fixed; left: max(16px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top));
  z-index: 1; pointer-events: none; font: 600 14px/1.3 var(--font); color: var(--amber); text-shadow: 0 0 6px rgba(255,140,30,.45); }
#hud .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
#hud .bar { position: relative; width: 170px; height: 14px; border-radius: 0; overflow: hidden;
  background: var(--panel); border: 2px solid var(--amber); }
#hud .fill { position: absolute; inset: 0 auto 0 0; width: 0; background: linear-gradient(90deg,#b97a1a,#d89a2e); }
#hud .bar.low .fill { background: var(--bad); }
#hud .bar.flash { box-shadow: 0 0 12px 3px rgba(216,154,46,.55); }
#hud .bar { transition: box-shadow .25s; }
#hud-pop { position: fixed; left: 50%; top: 38%; z-index: 1; pointer-events: none; transform: translateX(-50%);
  font: 700 28px var(--font); color: var(--amber); text-shadow: 0 2px 6px #000; opacity: 0; }
#hud-pop.large { color: var(--amber); font-size: 34px; }
#hud-pop.good { color: var(--cyan); }
#hud-pop.bad { color: var(--bad); }
#hud-prompt { position: fixed; left: 50%; top: 56%; z-index: 1; pointer-events: none; transform: translateX(-50%);
  font: 700 18px var(--font); text-shadow: 0 2px 6px #000; text-align: center; display: none; white-space: nowrap; }
#hud-prompt small { display: block; font: 500 12px var(--font); opacity: .85; }
#hud-prompt.hi { color: var(--green); } #hud-prompt.mid { color: var(--amber); } #hud-prompt.lo { color: var(--bad); } #hud-prompt.na { color: var(--text); }
#hud-flash { position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0; }
#hud-flash.good { background: radial-gradient(circle, rgba(111,196,192,0) 30%, rgba(111,196,192,.55) 100%); animation: hudflash .45s ease-out; }
#hud-flash.bad { background: radial-gradient(circle, rgba(192,69,46,0) 30%, rgba(192,69,46,.55) 100%); animation: hudflash .45s ease-out; }
@keyframes hudflash { 0% { opacity: 1; } 100% { opacity: 0; } }
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
  private readonly prompt: HTMLElement;
  private readonly flash: HTMLElement;
  private lastPrompt = '';
  private lastEnergy = -1;
  private lastCollected = -1;
  private flashUntil = 0;

  constructor(
    private readonly player: Player,
    private readonly resources: ResourceManager,
    private readonly skill: TunnelingSkill,
    private readonly isTouch: boolean,
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

    this.prompt = document.createElement('div');
    this.prompt.id = 'hud-prompt';
    document.body.appendChild(this.prompt);
    this.flash = document.createElement('div');
    this.flash.id = 'hud-flash';
    document.body.appendChild(this.flash);

    this.bar = root.querySelector('.bar')!;
    this.fill = root.querySelector('.fill')!;
    this.energyText = root.querySelector('#hud-energy')!;
    this.resText = root.querySelector('#hud-res')!;

    // 시작 안내 오버레이가 HUD를 가리지 않도록 오버레이를 HUD 위로 올린다.
    const hint = document.getElementById('hint');
    if (hint) hint.style.zIndex = '10';
  }

  render(_alpha: number): void {
    this.updateSkill();
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
      this.showPop(ev.gained > 0 ? `+${ev.gained}` : 'MAX', ev.kind === 'large' ? 'large' : '');
      this.bar.classList.add('flash');
      this.flashUntil = performance.now() + 250;
    }
    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.bar.classList.remove('flash');
      this.flashUntil = 0;
    }
  }

  private showPop(text: string, cls: string): void {
    this.pop.textContent = text;
    this.pop.className = cls;
    void this.pop.offsetWidth; // 애니메이션 재시작을 위한 리플로우
    this.pop.classList.add('show');
  }

  private showFlash(cls: 'good' | 'bad'): void {
    this.flash.className = '';
    void this.flash.offsetWidth;
    this.flash.className = cls;
  }

  private updateSkill(): void {
    const pr = this.skill.probe;
    let html = '';
    let cls = '';
    if (pr) {
      const key = this.isTouch ? '버튼' : 'E';
      if (!pr.landing) {
        html = '반대편이 막혀 있음';
        cls = 'na';
      } else if (!this.skill.canAfford()) {
        html = `에너지 부족 <small>${TUNNEL.COST}⚡ 필요</small>`;
        cls = 'na';
      } else {
        const pct = Math.round(pr.probability * 100);
        cls = pct >= 60 ? 'hi' : pct >= 30 ? 'mid' : 'lo';
        // 확률과 함께 두께·비용을 보여줘, 플레이어가 "왜 이 확률인지"를 읽고 에너지를 모으러 갈지 결정하게 한다.
        html = `터널링 ${pct}%<small>벽 ${pr.thickness.toFixed(2)}m · -${TUNNEL.COST}⚡ · ${key}</small>`;
      }
    }
    const sig = cls + html;
    if (sig !== this.lastPrompt) {
      this.lastPrompt = sig;
      this.prompt.style.display = html ? 'block' : 'none';
      this.prompt.className = cls;
      this.prompt.innerHTML = html;
    }

    for (const ev of this.skill.drainEvents()) {
      const pct = Math.round(ev.probability * 100);
      if (ev.type === 'success') {
        this.showPop(`통과! (${pct}%)`, 'good');
        this.showFlash('good');
      } else if (ev.type === 'fail') {
        this.showPop(`반사… (${pct}%)`, 'bad');
        this.showFlash('bad');
      } else if (ev.type === 'noenergy') {
        this.showPop('에너지 부족', 'bad');
      } else {
        this.showPop('막혀 있음', 'bad');
      }
    }
  }
}
