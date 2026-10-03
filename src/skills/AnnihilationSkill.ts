import * as THREE from 'three';
import type { Updatable } from '../engine/GameEngine';
import type { Level } from '../level/Level';
import type { Crate } from '../level/Crate';
import { Player } from '../player/Player';
import { COL } from '../render/palette';
import type { Particles } from './Particles';
import type { SkillInput } from './SkillInput';

/**
 * 질량-에너지 등가: E = mc².
 * 조준한 물체의 질량 m이 전부 에너지로 바뀐다. 게임에서는 c²을 "1kg당 에너지" 상수로 단순화한다.
 * 방출된 에너지는 두 군데로 간다 — 플레이어의 에너지 게이지(충전)와 폭발(반경·충격).
 * 폭발 반경은 방출 에너지에 비례하는 세기의 점폭발 R ∝ E^(1/2)로 잡았다(큰 물체일수록 반경이 커지되 완만히).
 */
export const ANNIHILATE = {
  /** c² 에 해당하는 상수: 질량 1kg → 에너지 10⚡. */
  C2: 10,
  COST: 6,
  REACH: 6,
  COOLDOWN: 0.6,
  /** R = RADIUS_K · √E */
  RADIUS_K: 0.55,
  /** 폭발 중심에서의 최대 충격 속도. 가장자리로 갈수록 선형으로 약해진다. */
  KNOCKBACK: 11,
  /** 연쇄: 폭발에 휘말린 상자는 중심에서 멀수록 늦게(충격파가 퍼지는 속도) 터진다. */
  WAVE_SPEED: 9,
} as const;

export const annihilationYield = (mass: number): number => mass * ANNIHILATE.C2;
export const blastRadius = (mass: number): number => ANNIHILATE.RADIUS_K * Math.sqrt(annihilationYield(mass));

export interface AnnihilateProbe {
  crate: Crate;
  distance: number;
  yield: number;
  radius: number;
}

/** 폭발 사건. 적(Phase 4)이 생기면 같은 이벤트로 피해를 줄 수 있게 중심·반경·에너지를 노출한다. */
export interface BlastEvent {
  center: THREE.Vector2;
  radius: number;
  energy: number;
}

export type AnnihilateEventType = 'annihilate' | 'noenergy' | 'full';
export interface AnnihilateEvent {
  type: AnnihilateEventType;
  /** 이번 폭발로 실제 충전된 에너지(상한에서 잘린 뒤). */
  gained: number;
  mass: number;
}

/** 2D 슬랩: 광선과 AABB의 진입 거리. 없으면 null. */
function rayHit(ox: number, oz: number, dx: number, dz: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, b.minX, b.maxX],
    [oz, dz, b.minZ, b.maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
    } else {
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
  }
  if (tMax < Math.max(tMin, 0)) return null;
  return Math.max(tMin, 0);
}

interface Fading {
  crate: Crate;
  t: number;
}
interface Primed {
  crate: Crate;
  delay: number;
}

export class AnnihilationSkill implements Updatable {
  probe: AnnihilateProbe | null = null;
  cooldown = 0;
  /** 폭발 구독자(Phase 4의 적 피해 등). 쌓아 두지 않고 즉시 호출해 누수가 없다. */
  readonly onBlast: ((b: BlastEvent) => void)[] = [];

  private readonly events: AnnihilateEvent[] = [];
  private readonly fading: Fading[] = [];
  private readonly primed: Primed[] = [];
  private readonly dir = new THREE.Vector2();
  private static readonly FADE_TIME = 0.22;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly player: Player,
    private readonly level: Level,
    private readonly input: SkillInput,
    private readonly particles: Particles,
  ) {}

  drainEvents(): AnnihilateEvent[] {
    return this.events.splice(0);
  }

  canAfford(): boolean {
    return this.player.energy >= ANNIHILATE.COST;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateFading(dt);
    this.updatePrimed(dt);

    this.probe = this.computeProbe();
    // 가득 차면 쓰지 못한다: 자원 수집과 같은 규칙 — 남겨 둔 물질은 나중을 위한 저축이다.
    const usable = !!this.probe && this.canAfford() && !this.player.isEnergyFull();
    this.input.setState(usable && this.cooldown === 0, !usable);

    if (!this.input.consumePressed()) return;
    if (this.cooldown > 0 || !this.probe) return;
    this.attempt(this.probe);
  }

  /** 시선 방향 첫 충돌체가 상자일 때만 대상. 벽 뒤의 상자는 조준할 수 없다(시선 차단). */
  private computeProbe(): AnnihilateProbe | null {
    const p = this.player.position;
    const dir = this.player.facing(this.dir);
    let best: { t: number; crate: Crate | null } | null = null;
    for (const w of this.level.walls) {
      const t = rayHit(p.x, p.y, dir.x, dir.y, w);
      if (t === null || t > ANNIHILATE.REACH) continue;
      if (!best || t < best.t) best = { t, crate: null };
    }
    for (const c of this.level.crates) {
      if (c.primed) continue;
      const t = rayHit(p.x, p.y, dir.x, dir.y, c.wall);
      if (t === null || t > ANNIHILATE.REACH) continue;
      if (!best || t <= best.t) best = { t, crate: c };
    }
    if (!best?.crate) return null;
    return {
      crate: best.crate,
      distance: best.t,
      yield: annihilationYield(best.crate.mass),
      radius: blastRadius(best.crate.mass),
    };
  }

  private attempt(probe: AnnihilateProbe): void {
    if (this.player.isEnergyFull()) {
      this.events.push({ type: 'full', gained: 0, mass: probe.crate.mass });
      return;
    }
    if (!this.player.spendEnergy(ANNIHILATE.COST)) {
      this.events.push({ type: 'noenergy', gained: 0, mass: probe.crate.mass });
      return;
    }
    this.cooldown = ANNIHILATE.COOLDOWN;
    this.detonate(probe.crate);
  }

  /** 상자 하나를 소멸시킨다: 충돌 제거 → 에너지 충전 → 폭발(충격·연쇄) → 연출. */
  private detonate(crate: Crate): void {
    this.level.removeCrate(crate);
    crate.primed = true;
    this.fading.push({ crate, t: 0 });

    const energy = annihilationYield(crate.mass);
    const radius = blastRadius(crate.mass);
    const gained = this.player.addEnergy(energy);
    this.events.push({ type: 'annihilate', gained, mass: crate.mass });

    const center = new THREE.Vector2(crate.x, crate.z);
    for (const fn of this.onBlast) fn({ center, radius, energy });

    // 충격: 폭발 중심에서 멀어질수록 선형 감쇠. 너무 가까이서 쏘면 내가 밀려난다(거리 선택이 전술이 된다).
    const away = new THREE.Vector2().subVectors(this.player.position, center);
    const d = away.length();
    if (d < radius) {
      if (d < 1e-3) away.copy(this.player.facing(this.dir)).negate();
      else away.divideScalar(d);
      this.player.applyKnockback(away.x, away.y, ANNIHILATE.KNOCKBACK * (1 - d / radius));
    }

    // 연쇄: 반경 안의 다른 상자는 충격파가 닿는 시간만큼 뒤에 소멸한다.
    for (const other of this.level.crates) {
      if (other.primed) continue;
      const od = Math.hypot(other.x - crate.x, other.z - crate.z);
      if (od > radius) continue;
      other.primed = true;
      this.primed.push({ crate: other, delay: od / ANNIHILATE.WAVE_SPEED + 0.08 });
    }

    const at = new THREE.Vector3(crate.x, crate.size / 2, crate.z);
    this.particles.burst(at, COL.amber, 28 + crate.mass * 14, 3 + crate.mass, 0.6);
    this.particles.burst(at, COL.cyan, 16, 2, 0.45);
    this.particles.shockwave(at, radius, COL.amber);
  }

  private updatePrimed(dt: number): void {
    for (let i = this.primed.length - 1; i >= 0; i--) {
      const pr = this.primed[i];
      pr.delay -= dt;
      if (pr.delay > 0) continue;
      this.primed.splice(i, 1);
      this.detonate(pr.crate);
    }
  }

  /** 소멸 연출: 밝게 번쩍이며 줄어든다. 충돌은 이미 사라졌으므로 지나갈 수 있다. */
  private updateFading(dt: number): void {
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t += dt;
      const k = Math.min(1, f.t / AnnihilationSkill.FADE_TIME);
      const mat = f.crate.mesh.material as THREE.MeshLambertMaterial;
      mat.emissive.setHex(COL.amber);
      mat.emissiveIntensity = 0.28 + 2.2 * k;
      f.crate.mesh.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (k >= 1) {
        f.crate.dispose(this.scene);
        this.fading.splice(i, 1);
      }
    }
  }
}
