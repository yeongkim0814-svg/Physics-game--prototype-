import type { AABB } from './AABB';

/** 2D 광선(방향은 단위벡터)이 AABB에 처음 닿는 거리. 닿지 않거나 뒤쪽이면 null. */
export function rayHitDistance(ox: number, oz: number, dx: number, dz: number, b: AABB): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
    } else {
      const t1 = (lo - o) / d;
      const t2 = (hi - o) / d;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
    }
  }
  if (tMax < Math.max(tMin, 0)) return null;
  return Math.max(tMin, 0);
}

/** maxDist 안에서 가장 가까운 장애물까지의 거리(없으면 maxDist). 시야 콘 그리기와 시선 차단 판정에 공용. */
export function castRay(ox: number, oz: number, dx: number, dz: number, maxDist: number, boxes: readonly AABB[]): number {
  let best = maxDist;
  for (const b of boxes) {
    const t = rayHitDistance(ox, oz, dx, dz, b);
    if (t !== null && t < best) best = t;
  }
  return best;
}
