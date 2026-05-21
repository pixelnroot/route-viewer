import type { RoutePoint, TravelMode } from '@/types/routes';
import type { RoutingResult } from './types';

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildStraightLineRoute(points: RoutePoint[]): RoutingResult {
  const sorted = [...points].sort((a, b) => a.order - b.order);
  const coordinates = sorted.map((p): [number, number] => [p.lng, p.lat]);
  let totalDistance = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDistance += haversineDistance(
      sorted[i - 1].lat, sorted[i - 1].lng,
      sorted[i].lat, sorted[i].lng
    );
  }
  return { geometry: { type: 'LineString', coordinates }, distance: totalDistance, duration: 0 };
}

export interface RouteWithFallback extends RoutingResult {
  isFallback: boolean;
}

async function routeOnePair(
  from: RoutePoint,
  to: RoutePoint,
  mode: TravelMode
): Promise<{ coords: [number, number][]; distance: number; usedFallback: boolean }> {
  try {
    const result = await fetchOSRMRoute([from, to], mode);
    return {
      coords: result.geometry.coordinates as [number, number][],
      distance: result.distance,
      usedFallback: false,
    };
  } catch {
    return {
      coords: [[from.lng, from.lat], [to.lng, to.lat]],
      distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
      usedFallback: true,
    };
  }
}

// Routes each consecutive pair independently: follows roads where they exist,
// falls back to straight line per-segment where they don't.
// If from.segmentMode === 'direct', skips OSRM and connects with straight line.
export async function fetchRouteWithFallback(
  points: RoutePoint[],
  mode: TravelMode = 'driving'
): Promise<RouteWithFallback> {
  if (points.length < 2) throw new Error('Need at least 2 points');

  const sorted = [...points].sort((a, b) => a.order - b.order);

  const segments = await Promise.all(
    sorted.slice(0, -1).map((from, i) => {
      if (from.segmentMode === 'direct') {
        const to = sorted[i + 1];
        return Promise.resolve({
          coords: [[from.lng, from.lat], [to.lng, to.lat]] as [number, number][],
          distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
          usedFallback: true,
        });
      }
      return routeOnePair(from, sorted[i + 1], mode);
    })
  );

  // Stitch segments: first coord of each segment duplicates last of previous — skip it
  const allCoords: [number, number][] = [segments[0].coords[0]];
  let totalDistance = 0;
  let anyFallback = false;

  for (const seg of segments) {
    allCoords.push(...seg.coords.slice(1));
    totalDistance += seg.distance;
    if (seg.usedFallback) anyFallback = true;
  }

  return {
    geometry: { type: 'LineString', coordinates: allCoords },
    distance: totalDistance,
    duration: 0,
    isFallback: anyFallback,
  };
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

// OSRM only supports driving natively via the public demo server
const OSRM_PROFILE_MAP: Record<TravelMode, string> = {
  driving: 'driving',
  walking: 'foot',
  cycling: 'bike',
};

export async function fetchOSRMRoute(
  points: RoutePoint[],
  mode: TravelMode = 'driving'
): Promise<RoutingResult> {
  if (points.length < 2) {
    throw new Error('Need at least 2 points to generate a route');
  }

  const sorted = [...points].sort((a, b) => a.order - b.order);
  const coords = sorted.map((p) => `${p.lng},${p.lat}`).join(';');
  const profile = OSRM_PROFILE_MAP[mode];
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OSRM request failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM returned no route: ${data.code}`);
  }

  const route = data.routes[0];
  return {
    geometry: route.geometry as GeoJSON.LineString,
    distance: route.distance,
    duration: route.duration,
  };
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}min`;
}
