import * as THREE from 'three';
import type { Updatable } from '../engine/GameEngine';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
  life: number;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  radius: number;
}

/** 일회성 입자 폭발. 풀링 없이 생성/폐기 — 스킬 사용 빈도가 낮아 단순함을 택했다. */
export class Particles implements Updatable {
  private readonly bursts: Burst[] = [];
  private readonly rings: Ring[] = [];

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

  /** 바닥에 퍼지는 충격파 고리. 폭발 "범위"가 눈에 보여야 플레이어가 반경을 배운다. */
  shockwave(at: THREE.Vector3, radius: number, color: number, life = 0.45): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 1, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.06, at.z);
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, life, radius });
  }

  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      // ease-out: 처음에 빠르게 퍼지다 감속 — 폭발 직후의 충격이 먼저 오는 느낌.
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * (1 - (1 - t) * (1 - t))));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
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
