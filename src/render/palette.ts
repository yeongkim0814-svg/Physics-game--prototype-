import * as THREE from 'three';
import { patchRetro } from './snap';

/** 낡은 산업 시설, 늦은 밤. 채도를 죽인 올리브/카키 계열 + 기능색(절대 바꾸지 않음). */
export const COL = {
  // 도장 금속
  oliveMid: 0x59603f,
  oliveDark: 0x363d2a,
  khaki: 0x8d8761,
  khakiDark: 0x6c694a,
  // 철·고무·전자
  steelDark: 0x2c2e29,
  steelMid: 0x4b4f44,
  aluminum: 0x8c8f82,
  brass: 0xa68a45,
  charcoal: 0x242523,
  rubber: 0x1a1b19,
  // 작업대·바닥·벽
  laminate: 0xa59c79,
  laminateDark: 0x857a5a,
  benchTop: 0x555a45,
  woodDark: 0x4a3b2a,
  wallStain: 0xa59d82,
  floorTile: 0x7b816b,
  grout: 0x2e3228,
  // 유리
  glass: 0x7f9a98,
  glassDark: 0x5d7673,
  // 기능색: 게임 의미(자원 종류·터널링 가능·경고)를 담으므로 임의로 바꾸지 않는다.
  hazardOrange: 0xc4701c,
  hazardYellow: 0xb9a02c,
  amber: 0xd89a2e,
  cyan: 0x6fc4c0,
  green: 0x7fbf6a,
  red: 0xc0452e,
} as const;

const cache = new Map<number, THREE.MeshLambertMaterial>();

/** 색 단위로 캐시한 Lambert 재질. 평면 음영(flatShading)으로 각진 로우폴리 느낌을 준다. */
export function lambert(color: number): THREE.MeshLambertMaterial {
  let m = cache.get(color);
  if (!m) {
    m = patchRetro(new THREE.MeshLambertMaterial({ color, flatShading: true }));
    cache.set(color, m);
  }
  return m;
}
