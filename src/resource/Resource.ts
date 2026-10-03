import * as THREE from 'three';
import type { ResourceKind } from '../level/Level';

interface KindSpec {
  energy: number;
  coreRadius: number;
  color: number;
}

export const RESOURCE_SPECS: Record<ResourceKind, KindSpec> = {
  small: { energy: 10, coreRadius: 0.16, color: 0x3fe0ff },
  large: { energy: 25, coreRadius: 0.28, color: 0xffb13b },
};

let haloTexture: THREE.CanvasTexture | null = null;

/** 부드러운 원형 광륜 텍스처. 어두운 방에서도 멀리서 눈에 띄게 하려는 것(조명 추가 없이 저렴하게). */
function getHaloTexture(): THREE.CanvasTexture {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  return haloTexture;
}

export type ResourceState = 'idle' | 'absorbing' | 'gone';

export class Resource {
  static readonly HOVER_HEIGHT = 0.9;
  /** 흡수 연출 길이(초). 너무 길면 이득 없이 기다리는 느낌, 너무 짧으면 흡수가 안 보인다. */
  static readonly ABSORB_TIME = 0.25;

  readonly spec: KindSpec;
  readonly position: THREE.Vector2;
  readonly group = new THREE.Group();
  state: ResourceState = 'idle';

  private absorbT = 0;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Sprite;

  constructor(x: number, z: number, readonly kind: ResourceKind) {
    this.spec = RESOURCE_SPECS[kind];
    this.position = new THREE.Vector2(x, z);

    // emissive를 써서 조명이 어두운 곳에서도 스스로 빛나 보이게 한다.
    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.spec.coreRadius, 0),
      new THREE.MeshStandardMaterial({
        color: this.spec.color,
        emissive: this.spec.color,
        emissiveIntensity: 1.6,
      }),
    );
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getHaloTexture(),
        color: this.spec.color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.halo.scale.setScalar(this.spec.coreRadius * 7);
    this.group.add(this.core, this.halo);
    this.group.position.set(x, Resource.HOVER_HEIGHT, z);
  }

  /** 렌더 프레임마다: 둥둥 떠다니며 회전(정지한 물체보다 "집을 수 있는 것"으로 읽힌다). */
  animateIdle(timeSec: number): void {
    if (this.state !== 'idle') return;
    this.group.position.y = Resource.HOVER_HEIGHT + Math.sin(timeSec * 2 + this.phase) * 0.08;
    this.core.rotation.y = timeSec * 1.5 + this.phase;
    this.core.rotation.x = timeSec * 0.9;
  }

  startAbsorb(): void {
    this.state = 'absorbing';
    this.absorbT = 0;
  }

  /** 고정 timestep에서 호출. 플레이어 쪽으로 빨려 들어가며 작아진다. 끝나면 true. */
  updateAbsorb(dt: number, target: THREE.Vector3): boolean {
    this.absorbT += dt;
    const t = Math.min(1, this.absorbT / Resource.ABSORB_TIME);
    // ease-in: 처음엔 천천히, 끝에 가속해 "빨려 들어가는" 느낌.
    const k = t * t;
    this.group.position.lerp(target, k);
    this.group.scale.setScalar(1 - k);
    if (t >= 1) {
      this.state = 'gone';
      return true;
    }
    return false;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.core.geometry.dispose();
    (this.core.material as THREE.Material).dispose();
    this.halo.material.dispose();
  }
}
