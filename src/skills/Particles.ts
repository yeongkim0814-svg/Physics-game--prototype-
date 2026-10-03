import * as THREE from 'three';
import type { Updatable } from '../engine/GameEngine';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
  life: number;
}

/** 일회성 입자 폭발. 풀링 없이 생성/폐기 — 스킬 사용 빈도가 낮아 단순함을 택했다. */
export class Particles implements Updatable {
  private readonly bursts: Burst[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  burst(at: THREE.Vector3, color: number, count = 36, speed = 3, life = 0.6): void {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      // 구 표면 균일 분포 방향
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.4 + Math.random() * 0.6);
      vel.set([r * Math.cos(a) * s, u * s, r * Math.sin(a) * s], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.09,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    // 폭발 중심이 시야 밖이어도 컬링되지 않도록(바운딩 계산 비용을 아끼려는 선택).
    points.frustumCulled = false;
    this.scene.add(points);
    this.bursts.push({ points, velocities: vel, age: 0, life });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += b.velocities[j] * dt;
        arr[j + 1] += b.velocities[j + 1] * dt;
        arr[j + 2] += b.velocities[j + 2] * dt;
      }
      attr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age >= b.life) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
