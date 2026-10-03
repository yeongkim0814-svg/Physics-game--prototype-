import type { Renderable } from '../engine/GameEngine';
import type { GameState } from '../game/GameState';

const CSS = `
#result { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: rgba(13,15,10,.82); text-align: center; font-family: var(--font); color: var(--text); padding: 0 16px; }
#result.on { display: flex; }
#result h1 { margin: 0; font-size: 28px; }
#result.win h1 { color: var(--green); }
#result.lose h1 { color: var(--bad); }
#result .sub { font-size: 14px; }
#result table { border-collapse: collapse; font-size: 14px; margin: 4px 0; }
#result td { border: 1px solid var(--amber-faint); padding: 3px 12px; text-align: left; }
#result td:last-child { text-align: right; color: var(--amber); font-variant-numeric: tabular-nums; }
#result .style { color: var(--amber); font-size: 14px; }
#result button { font: inherit; font-size: 16px; color: var(--amber); background: transparent; border: 2px solid var(--amber-dim);
  border-radius: 0; padding: 10px 18px; cursor: pointer; touch-action: manipulation; margin-top: 6px; }
#result button:active { background: var(--amber); color: var(--bg); }
`;

const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** 승리/패배 결과와 이번 판의 플레이 방식. 어떤 경로가 얼마나 쓰였는지 보여 줘, 밸런스(한 경로가 지배적인가)를 눈으로 확인한다. */
export class ResultScreen implements Renderable {
  private readonly el: HTMLElement;
  private shown = false;

  constructor(private readonly game: GameState) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'result';
    document.body.appendChild(this.el);
  }

  render(_alpha: number): void {
    if (this.shown || this.game.status === 'playing') return;
    this.shown = true;

    const won = this.game.status === 'won';
    const s = this.game.stats();
    const title = won ? '탈출 성공' : this.game.reason === 'time' ? '시간 초과' : '신호 소실';
    const sub = won ? '핵심 샘플을 확보했습니다' : this.game.reason === 'time' ? '제한 시간 안에 탈출하지 못했습니다' : '체력이 모두 소진되었습니다';

    const ways: string[] = [];
    if (s.tunnelOk > 0) ways.push('우회(터널링)');
    if (s.crates > 0) ways.push('소멸(E=mc²)');
    if (s.kills > 0) ways.push('제압');
    if (ways.length === 0) ways.push('정면 돌파');

    this.el.className = `on ${won ? 'win' : 'lose'}`;
    this.el.innerHTML = `
      <h1>${title}</h1>
      <div class="sub">${sub}</div>
      <table>
        <tr><td>소요 시간</td><td>${fmt(this.game.elapsed)}</td></tr>
        <tr><td>터널링 성공 / 실패</td><td>${s.tunnelOk} / ${s.tunnelFail}</td></tr>
        <tr><td>소멸시킨 상자</td><td>${s.crates}</td></tr>
        <tr><td>처치한 적</td><td>${s.kills}</td></tr>
        <tr><td>발각된 횟수</td><td>${s.spotted}</td></tr>
      </table>
      <div class="style">플레이 방식: ${ways.join(' + ')}</div>
      <button type="button">다시 시작</button>`;
    // pointerdown 전파를 막아야 Input의 터치 핸들러가 이 탭을 스틱/시점으로 가로채지 않는다.
    const btn = this.el.querySelector('button')!;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => location.reload());

    // 데스크톱은 포인터 락 상태라 버튼을 누르려면 먼저 풀어야 한다. 사망 화면 뒤로 안내가 비치지 않게 숨긴다.
    document.exitPointerLock?.();
    for (const id of ['hud-prompt', 'alert-badge', 'objective']) document.getElementById(id)?.style.setProperty('display', 'none', 'important');
  }
}
