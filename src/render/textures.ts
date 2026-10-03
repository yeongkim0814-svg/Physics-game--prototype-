import * as THREE from 'three';
import { COL } from './palette';

/** 시드 고정 난수(mulberry32): 새로고침해도 같은 얼룩/긁힘이 나와 "같은 방"으로 느껴지게 한다. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** 색을 밝기 배율로 어둡게/밝게. 타일 하나하나에 미세한 차이를 줄 때 쓴다. */
function shade(c: number, k: number): string {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * k) | 0;
  const b = Math.min(255, (c & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
}

function canvasTexture(
  w: number,
  h: number,
  seed: number,
  draw: (g: CanvasRenderingContext2D, r: () => number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, rng(seed));
  const tex = new THREE.CanvasTexture(c);
  // Nearest: 확대해도 도트가 뭉개지지 않게. 밉맵을 끄는 것도 같은 이유.
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(g: CanvasRenderingContext2D, r: () => number, w: number, h: number, n: number, color: string, a: number): void {
  g.fillStyle = color;
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) g.fillRect((r() * w) | 0, (r() * h) | 0, 1, 1);
  g.globalAlpha = 1;
}

/** 32×32 = 1m. 0.5m 타일 2×2. */
export function floorTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, 11, (g, r) => {
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        g.fillStyle = shade(COL.floorTile, 0.9 + r() * 0.2);
        g.fillRect(tx * 16, ty * 16, 16, 16);
      }
    }
    g.fillStyle = css(COL.grout);
    for (let i = 0; i < 2; i++) {
      g.fillRect(i * 16, 0, 1, 32);
      g.fillRect(0, i * 16, 32, 1);
    }
    speckle(g, r, 32, 32, 60, css(COL.oliveDark), 0.5); // 때
    speckle(g, r, 32, 32, 14, css(COL.khaki), 0.45); // 긁힘
  });
}

/** 64×96 = 2m×3m. 아래 올리브 띠 + 위 니코틴 베이지. tunnelable이면 청록 유리 패널 톤. */
export function wallTexture(tunnelable: boolean): THREE.CanvasTexture {
  return canvasTexture(64, 96, tunnelable ? 23 : 21, (g, r) => {
    const upper = tunnelable ? COL.glass : COL.wallStain;
    const lower = tunnelable ? COL.steelMid : COL.oliveMid;
    g.fillStyle = css(upper);
    g.fillRect(0, 0, 64, 96);
    g.fillStyle = css(lower);
    g.fillRect(0, 52, 64, 44); // 텍스처 y는 아래로 증가: 52~96이 벽 아랫부분
    g.fillStyle = css(tunnelable ? COL.steelDark : COL.oliveDark);
    g.fillRect(0, 52, 64, 2); // 띠 경계선
    // 패널 이음매 + 리벳
    g.fillStyle = css(tunnelable ? COL.glassDark : COL.khakiDark);
    g.fillRect(0, 0, 1, 96);
    g.fillRect(32, 0, 1, 96);
    g.fillStyle = css(COL.aluminum);
    for (let y = 8; y < 96; y += 16) {
      g.fillRect(2, y, 1, 1);
      g.fillRect(30, y, 1, 1);
      g.fillRect(34, y, 1, 1);
      g.fillRect(62, y, 1, 1);
    }
    if (tunnelable) {
      // "여기는 뚫을 수 있다"를 색 말고 무늬로도 알리는 청록 줄(색각 차이 대비).
      g.fillStyle = css(COL.cyan);
      g.fillRect(0, 26, 64, 2);
      g.fillRect(0, 34, 64, 1);
    }
    // 물자국: 위에서 아래로 흐른 세로 얼룩
    for (let i = 0; i < 5; i++) {
      const x = (r() * 64) | 0;
      const len = 10 + ((r() * 30) | 0);
      g.fillStyle = css(COL.oliveDark);
      g.globalAlpha = 0.25;
      g.fillRect(x, 0, 1 + ((r() * 2) | 0), len);
      g.globalAlpha = 1;
    }
    speckle(g, r, 64, 96, 120, css(COL.steelDark), 0.35);
  });
}

/** 32×32 = 1.2m. 60cm 격자 패널. */
export function ceilingTexture(): THREE.CanvasTexture {
  return canvasTexture(32, 32, 31, (g, r) => {
    g.fillStyle = css(COL.steelMid);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = css(COL.steelDark);
    g.fillRect(0, 0, 32, 1);
    g.fillRect(0, 16, 32, 1);
    g.fillRect(0, 0, 1, 32);
    g.fillRect(16, 0, 1, 32);
    speckle(g, r, 32, 32, 40, css(COL.oliveDark), 0.5);
    speckle(g, r, 32, 32, 10, css(COL.khakiDark), 0.4);
  });
}

/**
 * 월드 좌표 기준 UV 재계산: 벽 길이가 달라도 텍스처 도트 크기가 일정하게 유지된다.
 * 수평면은 (x,z)/su, 수직면은 (수평축, y)/(su, sv).
 */
export function worldUV(geo: THREE.BufferGeometry, offset: THREE.Vector3, su = 1, sv = 1): void {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / su, z / su);
    else if (nx > 0.5) uv.setXY(i, z / su, y / sv);
    else uv.setXY(i, x / su, y / sv);
  }
  uv.needsUpdate = true;
}
