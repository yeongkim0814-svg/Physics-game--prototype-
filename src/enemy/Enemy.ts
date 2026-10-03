import * as THREE from 'three';
import type { AABB } from '../level/AABB';
import { makeAABB, overlaps } from '../level/AABB';
import type { EnemyKind, EnemySpawn } from '../level/Level';
import { castRay } from '../level/raycast';
import { COL } from '../render/palette';
import { patchRetro } from '../render/snap';

export type AiState = 'idle' | 'alert' | 'chase';

export interface EnemySpec {
  hp: number;
  radius: number;
  patrolSpeed: number;
  chaseSpeed: number;
  /** 시야각(전체, 도)과 사거리(m). */
  fov: number;
  range: number;
  /** 의심 게이지가 가득 차 추격으로 넘어가는 시간(s). 짧을수록 반응이 빠르다. */
  alertTime: number;
  turnRate: number;
  /** 접촉 피해. */
  damage: number;
  body: number;
  size: [number, number, number];
}

/**
 * 두 적의 성격이 다르게 설계됐다 — 같은 회피 전략이 둘 다에게 통하지 않도록.
 *  감시병: 느리지만 넓게 본다(몰래 지나가기 어렵다). 달리면 따돌릴 수 있다.
 *  사냥개: 시야는 좁고 길지만 빠르고 반응이 빠르다(걸어서는 못 따돌린다).
 */
export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  sentry: { hp: 40, radius: 0.4, patrolSpeed: 1.3, chaseSpeed: 2.8, fov: 110, range: 6, alertTime: 0.9, turnRate: 2.5, damage: 20, body: COL.oliveMid, size: [0.8, 1.5, 0.8] },
  hound: { hp: 25, radius: 0.3, patrolSpeed: 2.2, chaseSpeed: 5.6, fov: 55, range: 9, alertTime: 0.45, turnRate: 6, damage: 12, body: COL.steelMid, size: [0.5, 0.8, 1.0] },
};

const STATE_COLOR: Record<AiState, number> = { idle: COL.hazardYellow, alert: COL.hazardOrange, chase: COL.red };
const CONE_RAYS = 14;
/** 추격 중에는 주변 경계를 높여 시야각/사거리가 넓어진다(놓친 플레이어를 쉽게 놓아주지 않게). */
const CHASE_FOV = 150;
const CHASE_RANGE_K = 1.3;
const LOSE_TIME = 4;
const SEARCH_TIME = 1.5;
const WAYPOINT_PAUSE = 0.7;

const iconCache = new Map<string, THREE.CanvasTexture>();
function iconTexture(ch: string, color: number): THREE.CanvasTexture {
  const key = ch + color;
  let t = iconCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d')!;
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.font = 'bold 15px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 8, 9);
    t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    iconCache.set(key, t);
  }
  return t;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Enemy {
  readonly spec: EnemySpec;
  readonly group = new THREE.Group();
  readonly position: THREE.Vector2;
  readonly prev: THREE.Vector2;
  /** 진행 방향 각도. 시선 벡터는 (-sin, -cos) — 플레이어 yaw와 같은 규약. */
  heading = 0;
  state: AiState = 'idle';
  hp: number;
  /** 0~1. 의심 게이지(alert 상태에서만 의미 있음) — HUD/머리 위 표시에 쓴다. */
  suspicion = 0;
  /** 이번 프레임에 막 발각 상태로 바뀌었는지(효과음 트리거용). */
  justSpotted = false;

  private stun = 0;
  private readonly knock = new THREE.Vector2();
  private wp = 1;
  private wpDir = 1;
  private pause = 0;
  private alertT = 0;
  private lostT = 0;
  private searchT = 0;
  private readonly target = new THREE.Vector2();
  private hasTarget = false;
  private readonly body: THREE.Mesh;
  private readonly eye: THREE.Mesh;
  private readonly cone: THREE.Mesh;
  private readonly icon: THREE.Sprite;
  private lastIcon = '';

  constructor(readonly kind: EnemyKind, private readonly path: EnemySpawn['path']) {
    this.spec = ENEMY_SPECS[kind];
    this.hp = this.spec.hp;
    this.position = new THREE.Vector2(path[0][0], path[0][1]);
    this.prev = this.position.clone();
    this.target.set(path[1]?.[0] ?? path[0][0], path[1]?.[1] ?? path[0][1]);

    const [w, h, d] = this.spec.size;
    this.body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      // 약한 emissive: 어두운 방에서도 윤곽이 읽히도록(환경과 같은 올리브라 묻히기 쉽다).
      patchRetro(new THREE.MeshLambertMaterial({ color: this.spec.body, emissive: this.spec.body, emissiveIntensity: 0.45, flatShading: true })),
    );
    this.body.position.y = h / 2;
    // 눈: 상태 색으로 발광해, 멀리서도 "지금 무슨 상태인가"가 읽힌다.
    this.eye = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.6, h * 0.16, 0.08),
      patchRetro(new THREE.MeshLambertMaterial({ color: COL.hazardYellow, emissive: COL.hazardYellow, emissiveIntensity: 1.4, flatShading: true })),
    );
    this.eye.position.set(0, h * 0.72, -d / 2 - 0.04);
    // 위험 줄무늬: 적임을 색으로 즉시 알리는 시그널(자원/벽의 색 언어와 겹치지 않는 노랑-검정).
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.04, h * 0.14, d + 0.04),
      patchRetro(new THREE.MeshLambertMaterial({ color: COL.hazardYellow, emissive: COL.hazardYellow, emissiveIntensity: 0.4, flatShading: true })),
    );
    stripe.position.y = h * 0.38;
    this.group.add(this.body, this.eye, stripe);

    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.icon.scale.setScalar(0.6);
    this.icon.position.y = h + 0.5;
    this.icon.visible = false;
    this.group.add(this.icon);

    // 시야 콘: 월드 좌표 정점을 매 프레임 갱신(벽에 가려진 만큼 잘려 보이도록). 그룹의 자식이 아니다.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < CONE_RAYS; i++) idx.push(0, i + 1, i + 2);
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: COL.hazardYellow, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.cone.frustumCulled = false;

    this.group.position.set(this.position.x, 0, this.position.y);
    this.heading = Math.atan2(-(this.target.x - this.position.x), -(this.target.y - this.position.y));
    this.recolor();
  }

  get coneMesh(): THREE.Mesh {
    return this.cone;
  }

  /** 시선 벡터. */
  facing(out = new THREE.Vector2()): THREE.Vector2 {
    return out.set(-Math.sin(this.heading), -Math.cos(this.heading));
  }

  private effFov(): number {
    return this.state === 'chase' ? CHASE_FOV : this.spec.fov;
  }
  private effRange(): number {
    return this.state === 'chase' ? this.spec.range * CHASE_RANGE_K : this.spec.range;
  }

  /** 시야각 + 사거리 + 시선 차단(벽/상자). */
  canSee(player: THREE.Vector2, walls: readonly AABB[]): boolean {
    const dx = player.x - this.position.x;
    const dz = player.y - this.position.y;
    const dist = Math.hypot(dx, dz);
    if (dist > this.effRange()) return false;
    if (dist > 0.01) {
      const diff = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.heading));
      if (diff > THREE.MathUtils.degToRad(this.effFov() / 2)) return false;
      if (castRay(this.position.x, this.position.y, dx / dist, dz / dist, dist, walls) < dist - 0.05) return false;
    }
    return true;
  }

  /** 소음(폭발 등)을 들으면 그 자리로 조사하러 간다. 이미 추격 중이면 목표만 갱신하지 않는다(플레이어가 우선). */
  hear(x: number, z: number): void {
    if (this.state === 'chase') return;
    this.target.set(x, z);
    this.hasTarget = true;
    this.searchT = 0;
    this.lostT = 0;
    this.setState('chase', true);
  }

  /** 피해를 주고 죽었는지 반환. 맞으면 잠시 경직되며 밀려난다. */
  hit(damage: number, fromX: number, fromZ: number, knockSpeed: number): boolean {
    this.hp -= damage;
    this.stun = 0.5;
    const dx = this.position.x - fromX;
    const dz = this.position.y - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.knock.set((dx / d) * knockSpeed, (dz / d) * knockSpeed);
    return this.hp <= 0;
  }

  update(dt: number, player: THREE.Vector2, playerSpeed: number, walls: readonly AABB[]): void {
    this.prev.copy(this.position);
    this.justSpotted = false;

    if (this.stun > 0) {
      this.stun -= dt;
      this.slide(this.knock.x * dt, this.knock.y * dt, walls);
      this.knock.multiplyScalar(Math.exp(-8 * dt));
      return;
    }

    const dist = this.position.distanceTo(player);
    const sees = this.canSee(player, walls);
    // 발소리: 달리면 멀리서도, 걸으면 코앞에서만, 가만히 있으면 거의 안 들린다 — 회피(은신)의 핵심 규칙.
    const hearRadius = playerSpeed > 5.5 ? 3.5 : playerSpeed > 0.5 ? 1.6 : 0.8;
    const notice = sees || dist < hearRadius;

    switch (this.state) {
      case 'idle':
        this.patrol(dt, walls);
        if (notice) {
          this.alertT = this.spec.alertTime * 0.15;
          this.setState('alert');
        }
        break;
      case 'alert': {
        this.turnToward(Math.atan2(-(player.x - this.position.x), -(player.y - this.position.y)), dt);
        // 가까울수록 빨리 확신한다: 코앞에서 얼쩡대면 의심 게이지가 더 빨리 찬다.
        if (notice) this.alertT += dt * (1 + Math.max(0, 1 - dist / this.spec.range));
        else this.alertT -= dt * 0.7;
        this.suspicion = Math.max(0, this.alertT / this.spec.alertTime);
        if (this.alertT >= this.spec.alertTime) {
          this.target.copy(player);
          this.hasTarget = true;
          this.lostT = 0;
          this.searchT = 0;
          this.setState('chase', true);
        } else if (this.alertT <= 0) {
          this.setState('idle');
        }
        break;
      }
      case 'chase': {
        if (sees || dist < hearRadius) {
          this.target.copy(player);
          this.hasTarget = true;
          this.lostT = 0;
          this.searchT = 0;
        } else {
          this.lostT += dt;
        }
        if (this.hasTarget) {
          const d = this.position.distanceTo(this.target);
          if (d > 0.35) {
            this.moveToward(this.target, this.spec.chaseSpeed, dt, walls);
          } else if (!sees) {
            // 마지막으로 본 자리에 도착했는데 없다 → 잠시 두리번거리다 포기
            this.searchT += dt;
            this.heading += dt * 2.2;
            if (this.searchT > SEARCH_TIME) this.giveUp();
          }
        }
        if (this.lostT > LOSE_TIME) this.giveUp();
        break;
      }
    }
  }

  private giveUp(): void {
    this.hasTarget = false;
    this.setState('idle');
    // 가장 가까운 순찰점부터 복귀
    let best = 0;
    let bd = Infinity;
    this.path.forEach((p, i) => {
      const d = Math.hypot(p[0] - this.position.x, p[1] - this.position.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.wp = best;
    this.target.set(this.path[best][0], this.path[best][1]);
    this.pause = 0;
  }

  private setState(next: AiState, spotted = false): void {
    if (this.state === next) return;
    this.state = next;
    this.justSpotted = spotted;
    if (next !== 'alert') this.suspicion = 0;
    this.recolor();
  }

  private recolor(): void {
    const c = STATE_COLOR[this.state];
    const m = this.eye.material as THREE.MeshLambertMaterial;
    m.color.setHex(c);
    m.emissive.setHex(c);
    (this.cone.material as THREE.MeshBasicMaterial).color.setHex(c);
    (this.cone.material as THREE.MeshBasicMaterial).opacity = this.state === 'chase' ? 0.42 : this.state === 'alert' ? 0.34 : 0.24;
  }

  private patrol(dt: number, walls: readonly AABB[]): void {
    if (this.path.length < 2) return;
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    const goal = this.path[this.wp];
    this.target.set(goal[0], goal[1]);
    if (this.position.distanceTo(this.target) < 0.25) {
      this.wp += this.wpDir;
      if (this.wp >= this.path.length || this.wp < 0) {
        this.wpDir = -this.wpDir;
        this.wp += this.wpDir * 2;
      }
      this.pause = WAYPOINT_PAUSE;
      return;
    }
    this.moveToward(this.target, this.spec.patrolSpeed, dt, walls);
  }

  private turnToward(angle: number, dt: number): void {
    const diff = wrapAngle(angle - this.heading);
    const step = this.spec.turnRate * dt;
    this.heading += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
  }

  private moveToward(to: THREE.Vector2, speed: number, dt: number, walls: readonly AABB[]): void {
    const dx = to.x - this.position.x;
    const dz = to.y - this.position.y;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    this.turnToward(Math.atan2(-dx, -dz), dt);
    // 몸이 목표를 향해 돌아선 만큼만 전진: 방향 전환이 느린 감시병은 급커브를 못 돈다.
    const align = Math.max(0, Math.cos(wrapAngle(Math.atan2(-dx, -dz) - this.heading)));
    const step = Math.min(d, speed * dt * (0.35 + 0.65 * align));
    this.slide((dx / d) * step, (dz / d) * step, walls);
  }

  /** 축 분리 이동 + 충돌(플레이어와 같은 방식). 벽에 비비며 미끄러진다. */
  private slide(dx: number, dz: number, walls: readonly AABB[]): void {
    this.position.x += dx;
    this.resolve('x', dx, walls);
    this.position.y += dz;
    this.resolve('y', dz, walls);
  }

  private resolve(axis: 'x' | 'y', delta: number, walls: readonly AABB[]): void {
    if (delta === 0) return;
    const r = this.spec.radius;
    for (const w of walls) {
      const box = makeAABB(this.position.x, this.position.y, r, r);
      if (!overlaps(box, w)) continue;
      if (axis === 'x') this.position.x = delta > 0 ? w.minX - r : w.maxX + r;
      else this.position.y = delta > 0 ? w.minZ - r : w.maxZ + r;
    }
  }

  /** 렌더 프레임: 위치 보간, 머리 위 표시, 시야 콘 갱신. */
  render(alpha: number, walls: readonly AABB[]): void {
    const x = THREE.MathUtils.lerp(this.prev.x, this.position.x, alpha);
    const z = THREE.MathUtils.lerp(this.prev.y, this.position.y, alpha);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = this.heading;

    const ch = this.state === 'chase' ? '!' : this.state === 'alert' ? '?' : '';
    if (ch !== this.lastIcon) {
      this.lastIcon = ch;
      this.icon.visible = ch !== '';
      if (ch) {
        (this.icon.material as THREE.SpriteMaterial).map = iconTexture(ch, STATE_COLOR[this.state]);
        (this.icon.material as THREE.SpriteMaterial).needsUpdate = true;
      }
    }

    const fov = THREE.MathUtils.degToRad(this.effFov());
    const range = this.effRange();
    const attr = this.cone.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, x, 0.04, z);
    for (let i = 0; i <= CONE_RAYS; i++) {
      const a = this.heading - fov / 2 + (fov * i) / CONE_RAYS;
      const dx = -Math.sin(a);
      const dz = -Math.cos(a);
      const len = castRay(x, z, dx, dz, range, walls);
      attr.setXYZ(i + 1, x + dx * len, 0.04, z + dz * len);
    }
    attr.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group, this.cone);
    for (const o of [this.body, this.eye, this.cone, ...this.group.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c !== this.body && c !== this.eye)]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    (this.icon.material as THREE.Material).dispose();
  }
}
