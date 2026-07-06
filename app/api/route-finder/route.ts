import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllRoutes } from '@/lib/data/routes-db';
import { buildGraph } from '@/lib/route-finder/graph';
import { findAllPaths } from '@/lib/route-finder/pathfinder';
import { haversineDistance } from '@/lib/routing/osrm';
import type { FinderRoute, FinderSegment, GraphEdge } from '@/lib/route-finder/types';

const BRIDGE_THRESHOLD_M = 2000;
const MAX_RESULTS = 20;

function reachableFrom(graph: ReturnType<typeof buildGraph>, startId: string): Set<string> {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const edge of graph.edgesByFrom.get(curr) ?? []) {
      if (!visited.has(edge.toId)) {
        visited.add(edge.toId);
        queue.push(edge.toId);
      }
    }
  }
  return visited;
}

function canRead(req: Request) {
  const auth = req.headers.get('Authorization');
  const vk = process.env.VIEW_ADMIN_KEY;
  const ek = process.env.EDIT_ADMIN_KEY;
  return (vk && auth === `Bearer ${vk}`) || (ek && auth === `Bearer ${ek}`);
}

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, val = 0;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += val & 1 ? ~(val >> 1) : val >> 1;
    shift = 0; val = 0;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += val & 1 ? ~(val >> 1) : val >> 1;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

async function fetchBridge(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  baseUrl: string
): Promise<{ coords: [number, number][]; distance: number; duration: number } | null> {
  try {
    const url = `${baseUrl}/api/directions?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=driving`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.length) return null;
    const r = data.routes[0];
    const coords = decodePolyline(r.overview_polyline.points);
    const distance: number = r.legs.reduce((s: number, l: { distance: { value: number } }) => s + l.distance.value, 0);
    const duration: number = r.legs.reduce((s: number, l: { duration: { value: number } }) => s + l.duration.value, 0);
    return { coords, distance, duration };
  } catch {
    return null;
  }
}

async function assemblePath(
  edgePath: GraphEdge[],
  baseUrl: string
): Promise<FinderRoute | null> {
  const segments: FinderSegment[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  const viaNames: string[] = [];
  const allCoords: [number, number][] = [];

  for (let i = 0; i < edgePath.length; i++) {
    const edge = edgePath[i];

    // Sub-route segment
    const seg: FinderSegment = {
      type: 'subroute',
      geometry: { type: 'LineString', coordinates: edge.coordsSlice },
      distance: edge.distance,
      duration: 0,
      subrouteId: edge.subrouteId,
      subrouteName: edge.subrouteName,
      subrouteColor: edge.subrouteColor,
      startIdx: edge.startCoordIdx,
      endIdx: edge.endCoordIdx,
    };
    segments.push(seg);
    totalDistance += edge.distance;
    if (!viaNames.includes(edge.subrouteName)) viaNames.push(edge.subrouteName);

    const sliceCoords = edge.coordsSlice;
    if (allCoords.length === 0) {
      allCoords.push(...sliceCoords);
    } else {
      allCoords.push(...sliceCoords.slice(1));
    }

    // Check if bridge needed to next edge
    if (i < edgePath.length - 1) {
      const nextEdge = edgePath[i + 1];
      const thisEnd = sliceCoords[sliceCoords.length - 1];
      const nextStart = nextEdge.coordsSlice[0];
      const gap = haversineDistance(thisEnd[1], thisEnd[0], nextStart[1], nextStart[0]);

      if (gap > 50 && gap <= BRIDGE_THRESHOLD_M) {
        const bridge = await fetchBridge(thisEnd[1], thisEnd[0], nextStart[1], nextStart[0], baseUrl);
        if (!bridge) return null; // can't bridge → discard path

        const bridgeSeg: FinderSegment = {
          type: 'bridge',
          geometry: { type: 'LineString', coordinates: bridge.coords },
          distance: bridge.distance,
          duration: bridge.duration,
        };
        segments.push(bridgeSeg);
        totalDistance += bridge.distance;
        totalDuration += bridge.duration;
        allCoords.push(...bridge.coords.slice(1));
      } else if (gap > BRIDGE_THRESHOLD_M) {
        return null; // gap too large → discard
      }
    }
  }

  return {
    id: uuidv4(),
    segments,
    totalDistance,
    totalDuration,
    geometry: { type: 'LineString', coordinates: allCoords },
    viaNames,
  };
}

// GET /api/route-finder → returns { locations: NamedLocation[] }
// GET /api/route-finder?from=<locationId> → only reachable destinations from that node
export async function GET(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const routes = getAllRoutes();
  const graph = buildGraph(routes);
  const fromId = new URL(req.url).searchParams.get('from');

  const allNodes = Array.from(graph.nodes.values()).filter((n) => n.showInFinder);

  if (fromId && graph.nodes.has(fromId)) {
    const reachable = reachableFrom(graph, fromId);
    reachable.delete(fromId);
    const locations = allNodes.filter((n) => reachable.has(n.id));
    return NextResponse.json({ locations });
  }

  return NextResponse.json({ locations: allNodes });
}

// POST /api/route-finder → returns { routes: FinderRoute[] }
export async function POST(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { startLocationId: string; endLocationId: string };
  const { startLocationId, endLocationId } = body;

  if (!startLocationId || !endLocationId) {
    return NextResponse.json({ error: 'startLocationId and endLocationId required' }, { status: 400 });
  }
  if (startLocationId === endLocationId) {
    return NextResponse.json({ routes: [] });
  }

  const subRoutes = getAllRoutes();
  const graph = buildGraph(subRoutes);

  if (!graph.nodes.has(startLocationId) || !graph.nodes.has(endLocationId)) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 });
  }

  const paths = findAllPaths(graph, startLocationId, endLocationId);

  const origin = new URL(req.url).origin;
  const routePromises = paths.slice(0, MAX_RESULTS).map((path) => assemblePath(path, origin));
  const settled = await Promise.all(routePromises);
  const routes = settled.filter((r): r is FinderRoute => r !== null);

  return NextResponse.json({ routes });
}
