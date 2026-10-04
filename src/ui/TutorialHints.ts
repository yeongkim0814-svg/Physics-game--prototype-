import type { Renderable } from '../engine/GameEngine';
import type { Player } from '../player/Player';
import type { TunnelingSkill } from '../skills/TunnelingSkill';
import type { AnnihilationSkill } from '../skills/AnnihilationSkill';
import type { EnemyManager } from '../enemy/EnemyManager';
import type { GameState } from '../game/GameState';

const CSS = `
#hints-toast { position: fixed; left: 50%; bottom: var(--hint-bottom, 90px); transform: translateX(-50%); z-index: 1; pointer-events: none;
  max-width: min(90vw, 520px); background: var(--panel); border: 2px solid var(--amber-dim); color: var(--text);
  font: 14px var(--font); padding: 8px 12px; text-align: center; border-radius: 0;
  opacity: 1; transition: opacity .25s; }
#hints-toast.hidden { opacity: 0; }
`;

interface HintDef {
  id: string;
  check: () => boolean;
  text: string;
}

/** 게임 진행 중 한 번씩만 표시되는 도움말 토스트. 큐에 대기 중인 여러 힌트는 순서대로 하나씩 나타난다. */
export class TutorialHints implements Renderable {
  private readonly toast: HTMLElement;
  private seenIds: Set<string> = new Set();
  private queue: HintDef[] = [];
  private activeHint: HintDef | null = null;
  private activeTime = 0;
  private lastNow = 0;
  private readonly hints: HintDef[];

  constructor(
    private readonly player: Player,
    private readonly tunneling: TunnelingSkill,
    private readonly annihilation: AnnihilationSkill,
    private readonly enemies: EnemyManager,
    private readonly game: GameState,
    private readonly isTouch: boolean,
  ) {
    // 스타일 주입
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 토스트 DOM 생성
    this.toast = document.createElement('div');
    this.toast.id = 'hints-toast';
    this.toast.className = 'hidden';
    document.body.appendChild(this.toast);

    // CSS 변수: 터치 기기일 때 높이 조정(터치 컨트롤 위쪽)
    const root = document.documentElement;
    if (this.isTouch) {
      root.style.setProperty('--hint-bottom', '22%');
    }

    // localStorage에서 본 힌트 ID 복원
    this.loadSeenIds();

    // 힌트 정의. 순서대로 평가되며, 같은 프레임에 여러 개가 발화하면 이 순서대로 큐에 들어간다.
    this.hints = [
      {
        id: 'goal',
        check: () => this.game.elapsed > 1.0,
        text: '목표: 북쪽 끝의 녹색 샘플을 집어 탈출하세요. 길은 셋 — 정면 돌파 / 터널링 우회 / 상자 소멸.',
      },
      {
        id: 'tunnel',
        check: () => !!this.tunneling.probe?.landing,
        text: `푸른 벽을 조준 중 — ${this.isTouch ? '[터널링] 버튼' : 'E 키'}: 통과. 에너지가 많고 벽이 얇을수록 확률이 높습니다.`,
      },
      {
        id: 'annihilate',
        check: () => !!this.annihilation.probe,
        text: `상자를 조준 중 — ${this.isTouch ? '[E=mc²] 버튼' : 'Q 키'}: 소멸. 에너지를 얻지만 폭발 소음이 적을 부릅니다.`,
      },
      {
        id: 'spotted',
        check: () => this.enemies.counts.spotted > 0,
        text: '발각됐습니다! 사냥개는 전력질주로만 따돌릴 수 있고, 시야 밖(벽 뒤)에서 4초 숨으면 추격을 포기합니다.',
      },
      {
        id: 'lowEnergy',
        check: () => this.player.energy < 15,
        text: '에너지가 부족합니다. 청록·호박 구슬을 모으거나 상자를 소멸시키세요.',
      },
      {
        id: 'lowHealth',
        check: () => this.player.health < 40,
        text: '체력이 낮습니다. 바닥의 반투명 콘(적의 시야)을 피해 움직이세요.',
      },
    ];
  }

  render(_alpha: number): void {
    // 게임이 플레이 중일 때만 작동
    if (this.game.status !== 'playing') {
      return;
    }

    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;

    // 현재 활성 힌트 시간 업데이트
    if (this.activeHint) {
      // 실제 경과 시간 기준: 주사율(60/144Hz)에 따라 토스트 길이가 달라지면 안 된다. 일시정지 복귀 직후의 큰 간격은 잘라낸다.
      this.activeTime += dt;
      const DISPLAY_TIME = 4.5;
      const FADE_TIME = 0.25;

      if (this.activeTime >= DISPLAY_TIME) {
        // 페이드 아웃 시작
        if (this.activeTime < DISPLAY_TIME + FADE_TIME) {
          this.toast.classList.add('hidden');
        } else {
          // 완전히 숨김 → 다음 힌트로
          this.activeHint = null;
          this.activeTime = 0;
          this.showNextHint();
        }
      }
    }

    // 활성 힌트가 없으면 새 힌트 큐 검토
    if (!this.activeHint) {
      this.enqueueNewHints();
      this.showNextHint();
    }
  }

  /** 새로 발화 가능한 힌트를 큐에 추가 */
  private enqueueNewHints(): void {
    for (const hint of this.hints) {
      if (this.seenIds.has(hint.id)) continue;
      if (this.queue.some((h) => h.id === hint.id)) continue;

      if (hint.check()) {
        // 'tunnel'과 'annihilate'는 context hint: probe가 사라지면 조건도 거짓이 되므로 특별 처리
        if ((hint.id === 'tunnel' || hint.id === 'annihilate') && !hint.check()) {
          continue;
        }
        this.queue.push(hint);
      }
    }
  }

  /** 큐의 첫 번째 힌트를 표시 */
  private showNextHint(): void {
    if (this.queue.length === 0) return;

    const hint = this.queue.shift()!;

    // 'tunnel'과 'annihilate'는 dequeue 시점에 조건 재확인
    if (hint.id === 'tunnel' && !this.tunneling.probe?.landing) {
      // probe가 null이면 표시하지 않고 seen도 표시하지 않음
      return;
    }
    if (hint.id === 'annihilate' && !this.annihilation.probe) {
      // probe가 null이면 표시하지 않고 seen도 표시하지 않음
      return;
    }

    this.activeHint = hint;
    this.activeTime = 0;
    this.toast.textContent = hint.text;
    this.toast.classList.remove('hidden');
    this.markSeen(hint.id);
  }

  /** localStorage에 본 힌트 ID 저장 */
  private markSeen(id: string): void {
    this.seenIds.add(id);
    try {
      const list = Array.from(this.seenIds);
      localStorage.setItem('psg-hints', JSON.stringify(list));
    } catch {
      // storage 오류는 무시 — in-memory 추적만 계속
    }
  }

  /** localStorage에서 본 힌트 ID 복원 */
  private loadSeenIds(): void {
    try {
      const stored = localStorage.getItem('psg-hints');
      if (stored) {
        this.seenIds = new Set(JSON.parse(stored) as string[]);
      }
    } catch {
      // storage 오류는 무시 — 빈 set으로 시작
      this.seenIds = new Set();
    }
  }
}
