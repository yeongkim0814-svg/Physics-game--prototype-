import * as THREE from 'three';
import type { Updatable } from '../engine/GameEngine';
import { Level } from '../level/Level';
import type { Wall } from '../level/Level';
import { makeAABB, overlaps } from '../level/AABB';
import { Player } from '../player/Player';
import type { Sfx } from '../audio/Sfx';
import type { Particles } from './Particles';
import type { SkillInput } from './SkillInput';

/**
 * 양자 터널링 모델.
 * 장벽(폭 L)에 입사한 입자의 투과 확률 T ≈ e^(-2κL),  κ = √(2m(V−E))/ħ.
 * 게임에서는 κ를 "에너지가 많을수록 작아지는 값"으로 단순화한다: κ = K / E.
 *  → E가 클수록, 벽이 얇을수록 확률↑. (두 변수 모두 플레이어가 눈으로 확인하고 고를 수 있다.)
 */
export const TUNNEL = {
  COST: 15,
  /** κ = K / E 의 상수. 에너지 100·벽 0.5m → 약 80%, 에너지 30·벽 1m → 약 23%가 되도록 잡았다. */
  K: 22,
  REACH: 1.6,
  COOLDOWN: 0.8,
  KNOCKBACK: 7,
} as const;

export function tunnelProbability(energy: number, thickness: number): number {
  const kappa = TUNNEL.K / Math.max(energy, 1);
  return Math.exp(-2 * kappa * thickness);
}

export interface TunnelProbe {
  wall: Wall;
  /** 시선 방향으로 잰 벽 진입/탈출 거리(플레이어 중심 기준). */
  tIn: number;
  tOut: number;
  thickness: number;
  probability: number;
  /** 반대편 안착 지점. 막혀 있으면 null → 시도 자체가 불가. */
  landing: THREE.Vector2 | null;
  hit: THREE.Vector2;
  exit: THREE.Vector2;
  dir: THREE.Vector2;
}

export type TunnelEventType = 'success' | 'fail' | 'noenergy' | 'blocked';
export interface TunnelEvent {
  type: TunnelEventType;
  probability: number;
}

/** 2D 슬랩 방법으로 광선-AABB 교차. 방향은 단위벡터. */
function rayAABB(ox: number, oz: number, dx: number, dz: number, b: Wall): { tIn: number; tOut: number } | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
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
  return { tIn: tMin, tOut: tMax };
}

export class TunnelingSkill implements Updatable {
  probe: TunnelProbe | null = null;
  cooldown = 0;
  private readonly events: TunnelEvent[] = [];
  private readonly dir = new THREE.Vector2();

  constructor(
    private readonly player: Player,
    private readonly walls: readonly Wall[],
    private readonly input: SkillInput,
    private readonly particles: Particles,
    private readonly sfx: Sfx,
  ) {}

  drainEvents(): TunnelEvent[] {
    return this.events.splice(0);
  }

  /** 에너지가 부족하면 확률이 아무리 높아도 쓸 수 없다. HUD가 이 값으로 안내 문구를 고른다. */
  canAfford(): boolean {
    return this.player.energy >= TUNNEL.COST;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.probe = this.player.isPhasing() ? null : this.computeProbe();

    const ready = !!this.probe?.landing && this.canAfford() && this.cooldown === 0;
    this.input.setState(ready, !this.probe?.landing || !this.canAfford());

    // 눌림은 항상 소비한다(대상이 없을 때 눌러 둔 입력이 나중에 발동되는 것을 막는다).
    if (!this.input.consumePressed()) return;
    if (this.cooldown > 0 || this.player.isPhasing() || !this.probe) return;
    this.attempt(this.probe);
  }

  private computeProbe(): TunnelProbe | null {
    const p = this.player.position;
    const dir = this.player.facing(this.dir);

    let best: { wall: Wall; tIn: number; tOut: number } | null = null;
    for (const w of this.walls) {
      if (!w.tunnelable) continue;
      const hit = rayAABB(p.x, p.y, dir.x, dir.y, w);
      if (!hit || hit.tOut <= 0 || hit.tIn > TUNNEL.REACH) continue;
      if (!best || hit.tIn < best.tIn) best = { wall: w, ...hit };
    }
    if (!best) return null;

    // 몸이 이미 벽에 반쯤 들어간 경우(tIn<0)는 반지름만큼 앞에서부터 센다 — 두께를 과소평가하지 않기 위해.
    const tIn = Math.max(best.tIn, 0);
    const thickness = best.tOut - tIn;
    const hit = new THREE.Vector2(p.x + dir.x * tIn, p.y + dir.y * tIn);
    const exit = new THREE.Vector2(p.x + dir.x * best.tOut, p.y + dir.y * best.tOut);

    // 착지: 출구에서 몸 반지름 + 여유만큼 더 나간 지점. 다른 벽이나 방 밖이면 불가.
    const landT = best.tOut + Player.RADIUS + 0.05;
    const landing = new THREE.Vector2(p.x + dir.x * landT, p.y + dir.y * landT);
    const box = makeAABB(landing.x, landing.y, Player.RADIUS, Player.RADIUS);
    const limit = Level.ROOM_SIZE / 2 - Player.RADIUS;
    const blocked =
      Math.abs(landing.x) > limit || Math.abs(landing.y) > limit || this.walls.some((w) => overlaps(box, w));

    return {
      wall: best.wall,
      tIn: best.tIn,
      tOut: best.tOut,
      thickness,
      probability: tunnelProbability(this.player.energy, thickness),
      landing: blocked ? null : landing,
      hit,
      exit,
      dir: dir.clone(),
    };
  }

  private attempt(probe: TunnelProbe): void {
    if (!probe.landing) {
      this.sfx.deny();
      this.events.push({ type: 'blocked', probability: probe.probability });
      return;
    }
    if (!this.player.spendEnergy(TUNNEL.COST)) {
      this.sfx.deny();
      this.events.push({ type: 'noenergy', probability: probe.probability });
      return;
    }
    this.cooldown = TUNNEL.COOLDOWN;

    // 확률은 소비 "전" 에너지로 계산된 값(probe)을 쓴다 — 화면에 보인 숫자와 실제 판정이 일치해야 공정하다.
    const y = 1.0;
    if (Math.random() < probe.probability) {
      this.player.startPhase(probe.landing);
      this.particles.burst(new THREE.Vector3(probe.hit.x, y, probe.hit.y), 0x7df9ff, 40, 3);
      this.particles.burst(new THREE.Vector3(probe.exit.x, y, probe.exit.y), 0x7df9ff, 40, 3);
      this.sfx.success();
      this.events.push({ type: 'success', probability: probe.probability });
    } else {
      this.player.applyKnockback(-probe.dir.x, -probe.dir.y, TUNNEL.KNOCKBACK);
      this.particles.burst(new THREE.Vector3(probe.hit.x, y, probe.hit.y), 0xff5a4a, 30, 4, 0.5);
      this.sfx.fail();
      this.events.push({ type: 'fail', probability: probe.probability });
    }
  }
}
