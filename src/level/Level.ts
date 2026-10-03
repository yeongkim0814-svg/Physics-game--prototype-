import * as THREE from 'three';
import { AABB, makeAABB } from './AABB';

/** 터널링 스킬이 읽는 벽 데이터. 바깥벽은 통과하면 방 밖 허공이므로 막아 둔다. */
export interface Wall extends AABB {
  tunnelable: boolean;
}

export type ResourceKind = 'small' | 'large';
export interface ResourceSpawn {
  x: number;
  z: number;
  kind: ResourceKind;
}

/**
 * 방 하나(기본 12m × 12m)와 벽/바닥.
 * 시각용 메시와 충돌용 AABB를 같은 데이터에서 만들어 둘이 어긋나지 않게 한다.
 * (터널링 스킬이 나중에 벽 두께 L을 읽어야 하므로 두께를 데이터로 보존)
 */
export class Level {
  static readonly ROOM_SIZE = 12;
  static readonly WALL_HEIGHT = 3;
  static readonly WALL_THICKNESS = 0.5;

  readonly walls: Wall[] = [];

  /**
   * 큰 자원은 구석/먼 곳에 둬서 "위험을 감수하고 멀리 가야 많이 얻는다"는 선택을 만든다.
   * 총량(작은 5×10 + 큰 3×25 = 125)은 최대 에너지(100)보다 약간 많아, 다 줍지 않아도 되지만 넉넉하진 않다.
   */
  readonly resourceSpawns: readonly ResourceSpawn[] = [
    { x: -4.5, z: 2.5, kind: 'small' },
    { x: 3.5, z: 3.5, kind: 'small' },
    { x: -2.5, z: -3.5, kind: 'small' },
    { x: 4.5, z: -2.5, kind: 'small' },
    { x: 0, z: -4.5, kind: 'small' },
    { x: 0, z: 1.2, kind: 'large' },
    { x: -5, z: -5, kind: 'large' },
    { x: 5, z: -5.2, kind: 'large' },
  ];

  constructor(scene: THREE.Scene) {
    this.buildLights(scene);
    this.buildFloor(scene);
    this.buildOuterWalls(scene);
    // 내부 장애물 예시: 이후 Phase 5의 경로 설계 자리
    this.addWall(scene, 0, -1, 4, 0.5, true); // 두께 1.0: 터널링이 어렵다
    this.addWall(scene, 4, 3, 0.125, 1.5, true); // 두께 0.25: 에너지가 낮아도 해볼 만하다
  }

  private buildLights(scene: THREE.Scene): void {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(4, 8, 3);
    scene.add(sun);
  }

  private buildFloor(scene: THREE.Scene): void {
    const s = Level.ROOM_SIZE;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ color: 0x555a60 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    // 격자는 이동 속도감/거리감을 읽기 위한 최소한의 시각 기준점.
    scene.add(new THREE.GridHelper(s, s, 0x888c92, 0x6a6e74));
  }

  private buildOuterWalls(scene: THREE.Scene): void {
    const half = Level.ROOM_SIZE / 2;
    const t = Level.WALL_THICKNESS;
    // 바깥쪽으로 두께를 내서 실내 면적이 정확히 12×12가 되게 한다.
    this.addWall(scene, 0, -(half + t / 2), half + t, t / 2);
    this.addWall(scene, 0, half + t / 2, half + t, t / 2);
    this.addWall(scene, -(half + t / 2), 0, t / 2, half);
    this.addWall(scene, half + t / 2, 0, t / 2, half);
  }

  private addWall(scene: THREE.Scene, cx: number, cz: number, hx: number, hz: number, tunnelable = false): void {
    const h = Level.WALL_HEIGHT;
    // 통과 가능한 벽은 푸른 기운을 줘서, 시각만으로 "이건 뚫을 수 있다"가 읽히게 한다.
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, h, hz * 2),
      new THREE.MeshStandardMaterial({ color: tunnelable ? 0x7f9fcf : 0x9aa0a6 }),
    );
    mesh.position.set(cx, h / 2, cz);
    scene.add(mesh);
    this.walls.push({ ...makeAABB(cx, cz, hx, hz), tunnelable });
  }
}
