import * as THREE from 'three';
import { COL } from '../render/palette';
import { patchRetro } from '../render/snap';
import type { Wall } from './Level';
import { makeAABB } from './AABB';

/** 질량(kg)별 외형. 무거울수록 크고 색이 진해, 조준하기 전에도 "얼마나 나올지"가 짐작된다. */
const LOOK: Record<number, number> = { 1: COL.laminateDark, 2: COL.brass, 3: COL.hazardOrange };

/**
 * 소멸시킬 수 있는 물질 덩어리. 충돌체(AABB)이기도 해서 길을 막는다 —
 * E=mc²는 "에너지 충전"과 "장애물 제거"를 한 번에 하는 스킬이라는 점이 핵심.
 */
export class Crate {
  readonly size: number;
  readonly wall: Wall;
  readonly mesh: THREE.Mesh;
  /** 폭발 연쇄 대기 중이면 true: 다시 조준하거나 중복으로 연쇄되지 않게 한다. */
  primed = false;

  constructor(
    readonly x: number,
    readonly z: number,
    readonly mass: number,
  ) {
    this.size = 0.5 + 0.2 * mass;
    const h = this.size / 2;
    this.wall = { ...makeAABB(x, z, h, h), tunnelable: false };
    const color = LOOK[mass] ?? COL.khaki;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.size, this.size, this.size),
      // 약한 emissive: 어두운 방에서도 "특별한 물체"로 읽히되 자원 구슬만큼 번쩍이진 않게.
      patchRetro(new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.28, flatShading: true })),
    );
    this.mesh.position.set(x, h, z);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
