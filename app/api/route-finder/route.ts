import { NextResponse } from 'next/server';
import { readGraph } from '@/lib/data/graph-db';
import {
  buildAdjacency,
  yenKShortest,
  reachableFrom,
  insertVirtualNode,
  type Adjacency,
} from '@/lib/graph/pathfinder';
import { edgePathToFinderRoute } from '@/lib/graph/assemble';
import type { GraphData, GraphNode, NamedLocation, FinderRoute } from '@/types/graph';

const K_ALTERNATIVES = 8;

function canRead(req: Request) {
  const auth = req.headers.get('Authorization');
  const vk = process.env.VIEW_ADMIN_KEY;
  const ek = process.env.EDIT_ADMIN_KEY;
  return (vk && auth === `Bearer ${vk}`) || (ek && auth === `Bearer ${ek}`);
}

function toNamedLocation(n: GraphNode): NamedLocation {
  return {
    id: n.id,
    label: n.name ?? `${n.lat.toFixed(4)}, ${n.lng.toFixed(4)}`,
    lat: n.lat,
    lng: n.lng,
    subrouteRefs: [],
    showInFinder: n.showInFinder,
  };
}

// GET /api/route-finder → { locations: NamedLocation[] }
// GET /api/route-finder?from=<nodeId> → only destinations reachable from that node
export async function GET(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const graph = readGraph();
  const fromId = new URL(req.url).searchParams.get('from');
  const findable = graph.nodes.filter((n) => n.showInFinder);

  if (fromId && graph.nodes.some((n) => n.id === fromId)) {
    const reachable = reachableFrom(buildAdjacency(graph), fromId);
    reachable.delete(fromId);
    return NextResponse.json({ locations: findable.filter((n) => reachable.has(n.id)).map(toNamedLocation) });
  }

  return NextResponse.json({ locations: findable.map(toNamedLocation) });
}

interface FinderRequestBody {
  startLocationId?: string;
  endLocationId?: string;
  startPoint?: { lat: number; lng: number };
  endPoint?: { lat: number; lng: number };
}

// Resolve an endpoint spec (node id or arbitrary point) to a node id, inserting
// a virtual node when a raw point is given. Returns null when unresolvable.
function resolveEndpoint(
  graph: GraphData,
  adj: Adjacency,
  id: string | undefined,
  point: { lat: number; lng: number } | undefined
): { nodeId: string; adj: Adjacency } | null {
  if (id) return graph.nodes.some((n) => n.id === id) ? { nodeId: id, adj } : null;
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    const ins = insertVirtualNode(graph, adj, point.lat, point.lng);
    return ins ? { nodeId: ins.node.id, adj: ins.adj } : null;
  }
  return null;
}

// POST /api/route-finder → { routes: FinderRoute[] }
// Body: { startLocationId | startPoint: {lat,lng), endLocationId | endPoint }
export async function POST(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as FinderRequestBody;
  const hasStart = body.startLocationId || body.startPoint;
  const hasEnd = body.endLocationId || body.endPoint;
  if (!hasStart || !hasEnd) {
    return NextResponse.json({ error: 'start and end location (id or point) required' }, { status: 400 });
  }
  if (body.startLocationId && body.startLocationId === body.endLocationId) {
    return NextResponse.json({ routes: [] });
  }

  const graph = readGraph();
  let adj = buildAdjacency(graph);

  const start = resolveEndpoint(graph, adj, body.startLocationId, body.startPoint);
  if (!start) return NextResponse.json({ error: 'Start location not found' }, { status: 404 });
  adj = start.adj;

  const end = resolveEndpoint(graph, adj, body.endLocationId, body.endPoint);
  if (!end) return NextResponse.json({ error: 'End location not found' }, { status: 404 });
  adj = end.adj;

  const paths = yenKShortest(adj, start.nodeId, end.nodeId, K_ALTERNATIVES);
  const routes: FinderRoute[] = paths.map((p) => edgePathToFinderRoute(p, graph));

  return NextResponse.json({ routes });
}
