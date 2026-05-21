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

export async function fetchRouteWithFallback(
  points: RoutePoint[],
  mode: TravelMode = 'driving'
): Promise<RouteWithFallback> {
  try {
    const result = await fetchOSRMRoute(points, mode);
    return { ...result, isFallback: false };
  } catch {
    return { ...buildStraightLineRoute(points), isFallback: true };
  }
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
