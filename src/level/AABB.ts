export interface AABB {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
}

/** 중심(cx,cz)과 반크기(hx,hz)로 AABB 생성. */
export function makeAABB(cx: number, cz: number, hx: number, hz: number): AABB {
  return { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz };
}

export function overlaps(a: AABB, b: AABB): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}
