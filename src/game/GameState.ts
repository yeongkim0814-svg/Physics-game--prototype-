import type { Updatable } from '../engine/GameEngine';
import type { Objective } from '../objective/Objective';
import type { Player } from '../player/Player';
import type { Sfx } from '../audio/Sfx';

export type GameStatus = 'playing' | 'won' | 'lost';
export type LoseReason = 'death' | 'time';

export interface RunStats {
  tunnelOk: number;
  tunnelFail: number;
  crates: number;
  kills: number;
  spotted: number;
}

/**
 * 한 판의 승패와 시간. 판정 우선순위: 목표 획득 > 사망 > 시간 초과
 * (같은 프레임에 겹치면 플레이어에게 유리한 쪽 — 막판 1프레임 때문에 억울하게 지지 않도록).
 */
export class GameState implements Updatable {
  static readonly TIME_LIMIT = 180;

  status: GameStatus = 'playing';
  reason: LoseReason | null = null;
  elapsed = 0;

  constructor(
    private readonly player: Player,
    private readonly objective: Objective,
    private readonly sfx: Sfx,
    private readonly readStats: () => RunStats,
  ) {}

  remaining(): number {
    return Math.max(0, GameState.TIME_LIMIT - this.elapsed);
  }

  stats(): RunStats {
    return this.readStats();
  }

  update(dt: number): void {
    if (this.status !== 'playing') return;
    this.elapsed += dt;

    if (this.objective.reached(this.player.position)) {
      this.status = 'won';
      this.player.frozen = true;
      this.sfx.win();
    } else if (this.player.dead) {
      this.status = 'lost';
      this.reason = 'death';
      this.sfx.lose();
    } else if (this.elapsed >= GameState.TIME_LIMIT) {
      this.status = 'lost';
      this.reason = 'time';
      this.player.frozen = true;
      this.sfx.lose();
    }
  }
}
