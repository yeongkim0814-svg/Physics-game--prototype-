import * as THREE from 'three';
import { AABB, makeAABB } from './AABB';
import { Crate } from './Crate';
import { COL } from '../render/palette';
import { patchRetro } from '../render/snap';
import { ceilingTexture, floorTexture, wallTexture, worldUV } from '../render/textures';

/** 터널링 스킬이 읽는 벽 데이터. 바깥벽은 통과하면 방 밖 허공이므로 막아 둔다. */
export interface Wall extends AABB {
  tunnelable: boolean;
}

export type EnemyKind = 'sentry' | 'hound';
export interface EnemySpawn {
  kind: EnemyKind;
  /** 순찰 경로(왕복). 첫 점이 시작 위치. */
  path: readonly (readonly [number, number])[];
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
  /** E=mc² 스킬이 소멸시킬 수 있는 물질 덩어리. 충돌 AABB는 walls에도 함께 들어 있다. */
  readonly crates: Crate[] = [];
  private scene: THREE.Scene;

  /**
   * 큰 자원은 구석/먼 곳에 둬서 "위험을 감수하고 멀리 가야 많이 얻는다"는 선택을 만든다.
   * 총량(작은 5×10 + 큰 3×25 = 125)은 최대 에너지(100)보다 약간 많아, 다 줍지 않아도 되지만 넉넉하진 않다.
   */
  /**
   * 감시병은 북쪽 방을 순찰하고, 사냥개는 정면 경로(오른쪽 통로)를 지킨다. 왼쪽은 비어 있지만 폭발 소음이 두 적을 부른다.
   * 시작 위치(0,4)에서 5m 이상 떨어뜨려, 들어오자마자 발각되는 일이 없게 했다.
   */
  readonly enemySpawns: readonly EnemySpawn[] = [
    { kind: 'sentry', path: [[-3, -2.8], [3.6, -2.8]] },
    { kind: 'hound', path: [[5.4, 4.8], [5.4, 2.0]] },
  ];

  /**
   * 탈출 목표(핵심 샘플). 북쪽 방 안쪽 끝에 있어 세 경로 중 하나로 안쪽에 들어가야 한다:
   *  정면 = 오른쪽 틈(열려 있지만 두 적이 지킴), 우회 = 안쪽 벽 터널링, 소멸 = 왼쪽 상자 제거(소음).
   */
  readonly objective = { x: 0, z: -5.3 };

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
    this.scene = scene;
    this.buildLights(scene);
    this.buildFloor(scene);
    this.buildOuterWalls(scene);
    // 내부 장애물 예시: 이후 Phase 5의 경로 설계 자리
    this.addWall(scene, 0, -1, 4, 0.6, true); // 두께 1.2: 에너지 100에서도 약 59%, 60이면 약 41%라 확실한 우회로는 아니다
    this.addWall(scene, 4, 3, 0.125, 1.5, true); // 두께 0.25: 에너지가 낮아도 해볼 만하다

    // 질량 1~3kg. 왼쪽 틈(x -6~-4)은 2m 상자 두 개가 막아, 소멸시켜야 지나갈 수 있다(연쇄 폭발 시연).
    this.addCrate(-4.6, -1.0, 2);
    this.addCrate(-5.5, -1.0, 2);
    this.addCrate(-3, 4.2, 1);
    this.addCrate(2, 1.6, 2);
    this.addCrate(2.6, -3.6, 1);
    this.addCrate(-1.2, -4.6, 3);
    this.addCrate(5.2, 0.6, 1);
  }

  private addCrate(x: number, z: number, mass: number): void {
    const c = new Crate(x, z, mass);
    this.crates.push(c);
    this.walls.push(c.wall);
    this.scene.add(c.mesh);
  }

  /** 소멸 시 충돌체와 목록에서 즉시 제거(길이 바로 열린다). 메시는 호출 측이 연출 후 dispose. */
  removeCrate(c: Crate): void {
    const wi = this.walls.indexOf(c.wall);
    if (wi >= 0) this.walls.splice(wi, 1);
    const ci = this.crates.indexOf(c);
    if (ci >= 0) this.crates.splice(ci, 1);
  }

  private buildLights(scene: THREE.Scene): void {
    // 늦은 밤의 형광등 아래: 차가운 위, 따뜻한 칙칙한 아래. 평면 음영이라 광원 방향이 면마다 밝기 차를 만든다.
    scene.add(new THREE.HemisphereLight(0xcfc89a, COL.oliveDark, 2.0));
    const sun = new THREE.DirectionalLight(0xe8e0b0, 1.1);
    sun.position.set(4, 8, 3);
    scene.add(sun);
  }

  private buildFloor(scene: THREE.Scene): void {
    const s = Level.ROOM_SIZE;
    const floorMap = floorTexture();
    floorMap.repeat.set(s, s); // 32px = 1m
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      patchRetro(new THREE.MeshLambertMaterial({ map: floorMap, flatShading: true })),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // 천장이 없으면 벽 위로 검은 허공이 보여 "방"이 아니라 "상자"처럼 보인다.
    const ceilMap = ceilingTexture();
    ceilMap.repeat.set(s / 1.2, s / 1.2); // 32px = 1.2m
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(s + Level.WALL_THICKNESS * 2, s + Level.WALL_THICKNESS * 2),
      patchRetro(new THREE.MeshLambertMaterial({ map: ceilMap, flatShading: true })),
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = Level.WALL_HEIGHT;
    scene.add(ceil);
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
    // 통과 가능한 벽은 청록 유리 패널 + 줄무늬 텍스처: 색과 무늬 두 가지로 "뚫을 수 있다"가 읽힌다.
    const geo = new THREE.BoxGeometry(hx * 2, h, hz * 2);
    const mesh = new THREE.Mesh(
      geo,
      patchRetro(new THREE.MeshLambertMaterial({ map: wallTexture(tunnelable), flatShading: true })),
    );
    mesh.position.set(cx, h / 2, cz);
    worldUV(geo, mesh.position, 2, 3); // 64px=2m, 96px=3m
    scene.add(mesh);
    this.walls.push({ ...makeAABB(cx, cz, hx, hz), tunnelable });
  }
}
