import type { RoutePoint, TravelMode } from '@/types/routes';
import { haversineDistance } from './osrm';

export interface RouteResult {
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
  isFallback: boolean;
}

const GOOGLE_MODE: Record<TravelMode, string> = {
  driving: 'driving',
  walking: 'walking',
  cycling: 'bicycling',
};

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let val = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      val |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += val & 1 ? ~(val >> 1) : val >> 1;

    shift = 0;
    val = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      val |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += val & 1 ? ~(val >> 1) : val >> 1;

    coords.push([lng / 1e5, lat / 1e5]); // GeoJSON [lng, lat]
  }

  return coords;
}

async function routeSegment(
  from: RoutePoint,
  to: RoutePoint,
  mode: TravelMode
): Promise<{ coords: [number, number][]; distance: number; duration: number; usedFallback: boolean }> {
  if (from.segmentMode === 'direct') {
    return {
      coords: [[from.lng, from.lat], [to.lng, to.lat]],
      distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
      duration: 0,
      usedFallback: true,
    };
  }

  try {
    const res = await fetch(
      `/api/directions?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=${GOOGLE_MODE[mode]}`
    );
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      throw new Error(`Google Directions: ${data.status}`);
    }

    const route = data.routes[0];
    const coords = decodePolyline(route.overview_polyline.points);
    const distance: number = route.legs.reduce((s: number, l: { distance: { value: number } }) => s + l.distance.value, 0);
    const duration: number = route.legs.reduce((s: number, l: { duration: { value: number } }) => s + l.duration.value, 0);

    return { coords, distance, duration, usedFallback: false };
  } catch {
    return {
      coords: [[from.lng, from.lat], [to.lng, to.lat]],
      distance: haversineDistance(from.lat, from.lng, to.lat, to.lng),
      duration: 0,
      usedFallback: true,
    };
  }
}

export async function fetchRouteGoogle(
  points: RoutePoint[],
  mode: TravelMode = 'driving'
): Promise<RouteResult> {
  if (points.length < 2) throw new Error('Need at least 2 points');

  const sorted = [...points].sort((a, b) => a.order - b.order);

  const segments = await Promise.all(
    sorted.slice(0, -1).map((from, i) => routeSegment(from, sorted[i + 1], mode))
  );

  const allCoords: [number, number][] = [segments[0].coords[0]];
  let totalDistance = 0;
  let totalDuration = 0;
  let anyFallback = false;

  for (const seg of segments) {
    allCoords.push(...seg.coords.slice(1));
    totalDistance += seg.distance;
    totalDuration += seg.duration;
    if (seg.usedFallback) anyFallback = true;
  }

  return {
    geometry: { type: 'LineString', coordinates: allCoords },
    distance: totalDistance,
    duration: totalDuration,
    isFallback: anyFallback,
  };
}
