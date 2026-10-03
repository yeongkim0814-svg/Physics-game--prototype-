import type { Renderable } from '../engine/GameEngine';
import type { GameState } from '../game/GameState';
import type { Objective } from '../objective/Objective';
import type { Player } from '../player/Player';

const CSS = `
#timer { position: fixed; right: max(16px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); z-index: 1; pointer-events: none;
  font: 700 22px var(--font); color: var(--amber); text-shadow: 0 0 6px rgba(255,140,30,.45); letter-spacing: 1px; font-variant-numeric: tabular-nums; }
#timer.low { color: var(--bad); animation: hpblink .5s steps(2) infinite; }
#objective { position: fixed; left: 50%; top: calc(max(10px, env(safe-area-inset-top)) + 36px); transform: translateX(-50%); z-index: 1; pointer-events: none;
  display: flex; align-items: center; gap: 8px; font: 700 14px var(--font); color: var(--green); text-shadow: 0 0 6px rgba(0,0,0,.8); }
#objective .arrow { display: inline-block; font-size: 20px; line-height: 1; }
`;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** 남은 시간과 목표 방향/거리. 12m 방이지만 벽 때문에 목표가 안 보이므로 방향 안내가 필요하다. */
export class MissionHud implements Renderable {
  private readonly timer: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly dist: HTMLElement;
  private lastSec = -1;
  private lastDist = -1;

  constructor(
    private readonly player: Player,
    private readonly objective: Objective,
    private readonly game: GameState,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.timer = document.createElement('div');
    this.timer.id = 'timer';
    document.body.appendChild(this.timer);

    const obj = document.createElement('div');
    obj.id = 'objective';
    obj.innerHTML = '<span>목표</span><span class="arrow">▲</span><span class="dist"></span>';
    document.body.appendChild(obj);
    this.arrow = obj.querySelector('.arrow')!;
    this.dist = obj.querySelector('.dist')!;
  }

  render(_alpha: number): void {
    const sec = Math.ceil(this.game.remaining());
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timer.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      this.timer.classList.toggle('low', sec <= 30);
    }

    const p = this.player.position;
    const dx = this.objective.position.x - p.x;
    const dz = this.objective.position.y - p.y;
    // 화살표는 "화면 위쪽 = 지금 보는 방향". 목표가 왼쪽이면(rel>0, yaw는 반시계가 +) 화살표를 반시계로 돌린다.
    const rel = wrap(Math.atan2(-dx, -dz) - this.player.yaw);
    this.arrow.style.transform = `rotate(${-rel}rad)`;
    const d = Math.round(Math.hypot(dx, dz));
    if (d !== this.lastDist) {
      this.lastDist = d;
      this.dist.textContent = `${d}m`;
    }
  }
}
