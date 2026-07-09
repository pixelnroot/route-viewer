import { haversineDistance } from '@/lib/routing/osrm';
import type { GraphSegmentEdge } from '@/types/graph';

export type Coord = [number, number]; // [lng, lat] — GeoJSON order

export function lineDistance(coords: Coord[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return d;
}

export interface PolylineProjection {
  segIdx: number;  // segment index: between coords[segIdx] and coords[segIdx+1]
  t: number;       // 0..1 along that segment
  lat: number;
  lng: number;
  distM: number;   // distance from query point to projection
}

const DEG_M = 111320; // meters per degree latitude

/**
 * Nearest point on a polyline to (lat, lng), via per-segment projection in a
 * local equirectangular plane. Adequate at sub-kilometer scales.
 */
export function nearestPointOnPolyline(coords: Coord[], lat: number, lng: number): PolylineProjection {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const px = lng * cosLat * DEG_M;
  const py = lat * DEG_M;

  let best: PolylineProjection = {
    segIdx: 0, t: 0, lat: coords[0][1], lng: coords[0][0],
    distM: haversineDistance(lat, lng, coords[0][1], coords[0][0]),
  };

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0] * cosLat * DEG_M;
    const ay = coords[i][1] * DEG_M;
    const bx = coords[i + 1][0] * cosLat * DEG_M;
    const by = coords[i + 1][1] * DEG_M;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const qLng = qx / (cosLat * DEG_M);
    const qLat = qy / DEG_M;
    const d = haversineDistance(lat, lng, qLat, qLng);
    if (d < best.distM) best = { segIdx: i, t, lat: qLat, lng: qLng, distM: d };
  }
  return best;
}

/**
 * Split a polyline at a projected point. Both halves share the split coordinate.
 * When t is ~0 or ~1 the split snaps to the segment vertex to avoid degenerate
 * near-duplicate coordinates.
 */
export function splitLineAt(coords: Coord[], segIdx: number, t: number): [Coord[], Coord[]] {
  const EPS = 1e-9;
  if (t <= EPS) return splitLineAtIndex(coords, segIdx);
  if (t >= 1 - EPS) return splitLineAtIndex(coords, segIdx + 1);
  const a = coords[segIdx];
  const b = coords[segIdx + 1];
  const split: Coord = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return [
    [...coords.slice(0, segIdx + 1), split],
    [split, ...coords.slice(segIdx + 1)],
  ];
}

/** Index-exact split — lossless: both halves are pure slices of the original. */
export function splitLineAtIndex(coords: Coord[], idx: number): [Coord[], Coord[]] {
  const i = Math.max(1, Math.min(coords.length - 2, idx));
  return [coords.slice(0, i + 1), coords.slice(i)];
}

export interface BBox { minLng: number; minLat: number; maxLng: number; maxLat: number; }

export function bbox(coords: Coord[]): BBox {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

export function bboxesOverlap(a: BBox, b: BBox, padM: number): boolean {
  const midLat = (a.minLat + a.maxLat + b.minLat + b.maxLat) / 4;
  const padLat = padM / DEG_M;
  const padLng = padM / (DEG_M * Math.max(0.1, Math.cos((midLat * Math.PI) / 180)));
  return (
    a.minLng - padLng <= b.maxLng && b.minLng - padLng <= a.maxLng &&
    a.minLat - padLat <= b.maxLat && b.minLat - padLat <= a.maxLat
  );
}

/**
 * Concatenate edge geometries into one coordinate list, dropping the duplicated
 * boundary coordinate between consecutive edges. Edges must already be oriented
 * head-to-tail (as SubRouteDef.edgeIds guarantees).
 */
export function concatEdgeGeometries(edges: GraphSegmentEdge[]): Coord[] {
  const out: Coord[] = [];
  for (const edge of edges) {
    const coords = edge.geometry.coordinates as Coord[];
    out.push(...(out.length === 0 ? coords : coords.slice(1)));
  }
  return out;
}
