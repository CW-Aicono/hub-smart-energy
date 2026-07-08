import type { Floor } from "@/hooks/useFloors";
import type { FloorRoom } from "@/hooks/useFloorRooms";

export interface FloorScale {
  /** meters per percent along X */
  sx: number;
  /** meters per percent along Y (world Z) */
  sz: number;
  /** center of the floor plan in percent coordinates (for translating polygons to world origin) */
  cxPct: number;
  czPct: number;
}

/**
 * Derive ONE shared percent→meter scale for the whole floor so that the
 * relative arrangement drawn in the 2D floor plan is preserved in 3D.
 *
 * Priority:
 *  1) Rooms that have both a polygon AND width/depth in meters → average sx/sz.
 *  2) floor.area_sqm vs sum of polygon areas (%^2) → isotropic scale.
 *  3) Fallback 0.1 m/% (≈ 10 m × 10 m plan).
 */
export function computeFloorScale(rooms: FloorRoom[], floor: Floor | null | undefined): FloorScale {
  const sxs: number[] = [];
  const szs: number[] = [];

  for (const r of rooms) {
    const pts = r.polygon_points;
    if (!pts || pts.length < 3) continue;
    if (!(r.width > 0) || !(r.depth > 0)) continue;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bd = Math.max(...ys) - Math.min(...ys);
    if (bw > 0.01) sxs.push(r.width / bw);
    if (bd > 0.01) szs.push(r.depth / bd);
  }

  let sx = sxs.length ? sxs.reduce((a, b) => a + b, 0) / sxs.length : 0;
  let sz = szs.length ? szs.reduce((a, b) => a + b, 0) / szs.length : 0;

  if ((!sx || !sz) && floor?.area_sqm && floor.area_sqm > 0) {
    let polyArea = 0;
    for (const r of rooms) {
      const pts = r.polygon_points;
      if (!pts || pts.length < 3) continue;
      let a = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      polyArea += Math.abs(a / 2);
    }
    if (polyArea > 0) {
      const s = Math.sqrt(floor.area_sqm / polyArea);
      if (!sx) sx = s;
      if (!sz) sz = s;
    }
  }

  if (!sx) sx = 0.1;
  if (!sz) sz = sx;

  // Center on midpoint of the union bounding box of all polygons.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    const pts = r.polygon_points;
    if (!pts || pts.length < 3) continue;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const cxPct = Number.isFinite(minX) ? (minX + maxX) / 2 : 50;
  const czPct = Number.isFinite(minY) ? (minY + maxY) / 2 : 50;

  return { sx, sz, cxPct, czPct };
}

/** Convert a polygon point in percent coords to world XZ meters. */
export function polyToWorld(
  p: { x: number; y: number },
  scale: FloorScale,
): [number, number] {
  return [(p.x - scale.cxPct) * scale.sx, (p.y - scale.czPct) * scale.sz];
}
