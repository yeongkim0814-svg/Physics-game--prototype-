import * as THREE from 'three';
import type { Renderable, Updatable } from '../engine/GameEngine';
import type { ResourceSpawn } from '../level/Level';
import type { Player } from '../player/Player';
import { Resource } from './Resource';

export interface CollectEvent {
  /** 실제로 채워진 에너지(상한에서 잘린 뒤). */
  gained: number;
  kind: Resource['kind'];
}

export class ResourceManager implements Updatable, Renderable {
  /** 플레이어 몸통 반경 + 자원 흡수 반경. 눈에 띄게 "닿기만 해도" 먹히도록 코어보다 넉넉히 잡는다. */
  private static readonly PICKUP_RADIUS = 0.55;

  private readonly resources: Resource[] = [];
  private readonly eyeTarget = new THREE.Vector3();
  private collected = 0;
  /** 한 프레임에 여러 번 수집돼도 놓치지 않도록 이벤트를 쌓았다가 HUD가 가져간다. */
  private readonly events: CollectEvent[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly player: Player,
    spawns: readonly ResourceSpawn[],
  ) {
    for (const s of spawns) {
      const r = new Resource(s.x, s.z, s.kind);
      this.resources.push(r);
      scene.add(r.group);
    }
  }

  get total(): number {
    return this.resources.length;
  }

  get collectedCount(): number {
    return this.collected;
  }

  drainEvents(): CollectEvent[] {
    return this.events.splice(0);
  }

  update(dt: number): void {
    const p = this.player.position;
    this.eyeTarget.set(p.x, Resource.HOVER_HEIGHT * 0.9, p.y);

    for (const r of this.resources) {
      if (r.state === 'idle') {
        // 에너지가 가득 찼으면 줍지 않는다: 낭비를 막아, 나중에 다시 와서 쓸 "저축"이 된다(익스트랙션 루프).
        if (this.player.isEnergyFull()) continue;
        if (r.position.distanceTo(p) <= ResourceManager.PICKUP_RADIUS) {
          const gained = this.player.addEnergy(r.spec.energy);
          this.collected++;
          this.events.push({ gained, kind: r.kind });
          r.startAbsorb();
        }
      } else if (r.state === 'absorbing') {
        if (r.updateAbsorb(dt, this.eyeTarget)) r.dispose(this.scene);
      }
    }
  }

  render(_alpha: number): void {
    const t = performance.now() / 1000;
    for (const r of this.resources) r.animateIdle(t);
  }
}
