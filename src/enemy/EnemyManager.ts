import * as THREE from 'three';
import type { Sfx } from '../audio/Sfx';
import type { Renderable, Updatable } from '../engine/GameEngine';
import type { EnemySpawn, Level } from '../level/Level';
import type { Player } from '../player/Player';
import { COL } from '../render/palette';
import type { BlastEvent } from '../skills/AnnihilationSkill';
import type { Particles } from '../skills/Particles';
import { Enemy } from './Enemy';

export type EnemyEventType = 'spotted' | 'hurt' | 'kill';
export interface EnemyEvent {
  type: EnemyEventType;
  /** hurt: 입은 피해량 */
  amount?: number;
}

/** 폭발이 에너지 1당 주는 최대 피해(중심). 질량 1kg(10⚡) 상자를 코앞에서 터뜨리면 감시병(40)을 한 방에 잡는다. */
const BLAST_DAMAGE_PER_ENERGY = 4;
const BLAST_KNOCKBACK = 9;
/** 폭발 소리가 들리는 거리 = 기본 + 폭발 반경 × 계수. 큰 폭발일수록 멀리 퍼진다(제압의 대가: 소음). */
const NOISE_BASE = 6;
const NOISE_PER_RADIUS = 3;

export class EnemyManager implements Updatable, Renderable {
  readonly enemies: Enemy[] = [];
  private readonly events: EnemyEvent[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly player: Player,
    private readonly level: Level,
    spawns: readonly EnemySpawn[],
    private readonly particles: Particles,
    private readonly sfx: Sfx,
  ) {
    for (const s of spawns) {
      const e = new Enemy(s.kind, s.path);
      this.enemies.push(e);
      scene.add(e.group, e.coneMesh);
    }
  }

  drainEvents(): EnemyEvent[] {
    return this.events.splice(0);
  }

  /** 0: 평온, 1: 의심 중인 적이 있음, 2: 추격 중인 적이 있음. HUD 경계 표시용. */
  alertLevel(): 0 | 1 | 2 {
    let lvl: 0 | 1 | 2 = 0;
    for (const e of this.enemies) {
      if (e.state === 'chase') return 2;
      if (e.state === 'alert') lvl = 1;
    }
    return lvl;
  }

  /** 스킬 폭발 → 범위 안 적에게 거리 감쇠 피해, 범위 밖이어도 가까우면 소음을 들었다고 본다. */
  onBlast(b: BlastEvent): void {
    const hearDist = NOISE_BASE + b.radius * NOISE_PER_RADIUS;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d = e.position.distanceTo(b.center);
      if (d < b.radius + e.spec.radius) {
        const falloff = 1 - Math.min(1, d / b.radius);
        const dmg = b.energy * BLAST_DAMAGE_PER_ENERGY * falloff;
        const dead = e.hit(dmg, b.center.x, b.center.y, BLAST_KNOCKBACK * (0.4 + 0.6 * falloff));
        if (dead) {
          this.kill(e, i);
          continue;
        }
      }
      if (d < hearDist) e.hear(b.center.x, b.center.y);
    }
  }

  private kill(e: Enemy, index: number): void {
    const at = new THREE.Vector3(e.position.x, 0.8, e.position.y);
    this.particles.burst(at, COL.red, 34, 3.5, 0.6);
    this.particles.burst(at, COL.amber, 18, 2.5, 0.5);
    this.sfx.kill();
    this.events.push({ type: 'kill' });
    e.dispose(this.scene);
    this.enemies.splice(index, 1);
  }

  update(dt: number): void {
    const p = this.player.position;
    const speed = this.player.speed();
    for (const e of this.enemies) {
      if (this.player.dead) break;
      e.update(dt, p, speed, this.level.walls);
      if (e.justSpotted) {
        this.sfx.alert();
        this.events.push({ type: 'spotted' });
      }
      // 접촉 피해: 몸이 닿으면 피해 + 반동(무적 시간 동안은 중복 피해 없음).
      if (e.position.distanceTo(p) < e.spec.radius + 0.3 + 0.05) {
        if (this.player.takeDamage(e.spec.damage, e.position.x, e.position.y)) {
          this.sfx.hurt();
          this.events.push({ type: 'hurt', amount: e.spec.damage });
        }
      }
    }
  }

  render(alpha: number): void {
    for (const e of this.enemies) e.render(alpha, this.level.walls);
  }
}
