import type { RoutePoint, TravelMode } from '@/types/routes';
import type { RoutingResult } from './types';

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
