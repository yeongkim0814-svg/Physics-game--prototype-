import * as THREE from 'three';
import type { Renderable } from '../engine/GameEngine';
import { COL } from '../render/palette';
import { patchRetro } from '../render/snap';
import { getHaloTexture } from '../resource/Resource';

/**
 * 탈출 목표물. 집으면 승리.
 * 자원 구슬(청록/호박)과 구분되도록 녹색 기능색 + 더 크고 느리게 도는 팔면체 + 바닥 고리로 "특별한 물건"임을 알린다.
 */
export class Objective implements Renderable {
  static readonly PICKUP_RADIUS = 0.8;

  readonly position: THREE.Vector2;
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly ring: THREE.Mesh;

  constructor(scene: THREE.Scene, x: number, z: number) {
    this.position = new THREE.Vector2(x, z);

    this.core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      patchRetro(new THREE.MeshLambertMaterial({ color: COL.green, emissive: COL.green, emissiveIntensity: 1.2, flatShading: true })),
    );
    this.core.position.y = 1.1;

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getHaloTexture(), color: COL.green, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    halo.scale.setScalar(3.4);
    halo.position.y = 1.1;

    // 바닥 고리: 가까이 가면 어디까지가 획득 범위인지 보여준다.
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(Objective.PICKUP_RADIUS - 0.08, Objective.PICKUP_RADIUS, 20),
      new THREE.MeshBasicMaterial({ color: COL.green, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;

    this.group.add(this.core, halo, this.ring);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  reached(p: THREE.Vector2): boolean {
    return this.position.distanceTo(p) <= Objective.PICKUP_RADIUS;
  }

  render(_alpha: number): void {
    const t = performance.now() / 1000;
    this.core.position.y = 1.1 + Math.sin(t * 1.8) * 0.1;
    this.core.rotation.y = t * 0.9;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3));
  }
}
