import * as THREE from 'three';
import type { Renderable, Updatable } from '../engine/GameEngine';
import { AABB, makeAABB, overlaps } from '../level/AABB';
import type { Input } from './Input';

export class Player implements Updatable, Renderable {
  static readonly RADIUS = 0.3;
  static readonly EYE_HEIGHT = 1.6;
  static readonly WALK_SPEED = 4;
  static readonly RUN_SPEED = 7;
  // 가속 상수: 클수록 입력에 즉각 반응(날카로움), 작을수록 미끄러짐.
  private static readonly ACCEL = 14;
  private static readonly MOUSE_SENS = 0.0022;
  private static readonly PITCH_LIMIT = Math.PI / 2 - 0.01;

  /** 로직 상태(고정 timestep). 렌더는 prev→pos를 보간해 고주사율에서도 부드럽게 보이게 한다. */
  readonly position = new THREE.Vector2(0, 4);
  private readonly prevPosition = this.position.clone();
  private readonly velocity = new THREE.Vector2();

  yaw = 0;
  pitch = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly walls: readonly AABB[],
  ) {}

  update(dt: number): void {
    this.prevPosition.copy(this.position);

    // 로컬 입력(앞=-z, 오른쪽=+x)을 yaw로 회전해 월드 방향으로 변환.
    let ix = 0;
    let iz = 0;
    if (this.input.isDown('KeyW')) iz -= 1;
    if (this.input.isDown('KeyS')) iz += 1;
    if (this.input.isDown('KeyA')) ix -= 1;
    if (this.input.isDown('KeyD')) ix += 1;

    const speed = this.input.isDown('ShiftLeft') ? Player.RUN_SPEED : Player.WALK_SPEED;
    const len = Math.hypot(ix, iz);
    let tx = 0;
    let tz = 0;
    if (len > 0) {
      // 정규화하지 않으면 대각선 이동이 √2배 빨라진다.
      ix /= len;
      iz /= len;
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      tx = (ix * cos + iz * sin) * speed;
      tz = (-ix * sin + iz * cos) * speed;
    }

    // 지수 보간으로 목표속도에 접근: 프레임레이트와 무관(고정 dt)하고 급정지 느낌 완화.
    const k = 1 - Math.exp(-Player.ACCEL * dt);
    this.velocity.x += (tx - this.velocity.x) * k;
    this.velocity.y += (tz - this.velocity.y) * k;

    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('y', this.velocity.y * dt);
  }

  /**
   * 축별 분리 이동: x 먼저, 막히면 되돌리고, 그다음 z.
   * 벽에 비스듬히 부딪혀도 벽을 따라 미끄러지게 하려는 것(멈춰버리면 조작감이 나쁘다).
   */
  private moveAxis(axis: 'x' | 'y', delta: number): void {
    if (delta === 0) return;
    this.position[axis] += delta;
    const box = makeAABB(this.position.x, this.position.y, Player.RADIUS, Player.RADIUS);
    for (const wall of this.walls) {
      if (!overlaps(box, wall)) continue;
      if (axis === 'x') {
        this.position.x = delta > 0 ? wall.minX - Player.RADIUS : wall.maxX + Player.RADIUS;
      } else {
        this.position.y = delta > 0 ? wall.minZ - Player.RADIUS : wall.maxZ + Player.RADIUS;
      }
      this.velocity[axis] = 0;
      // 이후 벽과도 겹칠 수 있으므로 box 재계산.
      box.minX = this.position.x - Player.RADIUS;
      box.maxX = this.position.x + Player.RADIUS;
      box.minZ = this.position.y - Player.RADIUS;
      box.maxZ = this.position.y + Player.RADIUS;
    }
  }

  render(alpha: number): void {
    // 시점은 렌더 프레임마다 즉시 반영(입력 지연 최소화), 위치만 보간.
    const { dx, dy } = this.input.consumeMouse();
    this.yaw -= dx * Player.MOUSE_SENS;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * Player.MOUSE_SENS, -Player.PITCH_LIMIT, Player.PITCH_LIMIT);

    const x = THREE.MathUtils.lerp(this.prevPosition.x, this.position.x, alpha);
    const z = THREE.MathUtils.lerp(this.prevPosition.y, this.position.y, alpha);
    this.camera.position.set(x, Player.EYE_HEIGHT, z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
