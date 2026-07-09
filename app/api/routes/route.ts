import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllRoutes, createRoute } from '@/lib/data/routes-db';
import { readGraph, writeGraph, toSavedRoutes } from '@/lib/data/graph-db';
import { applySubroute } from '@/lib/graph/compiler';
import { canRead, canEdit } from '@/lib/auth';
import type { SavedRoute } from '@/types/routes';

// Sub-routes live in the graph (data/graph.json) — derived back to the legacy
// SavedRoute shape here. routes.json only serves main routes now.
export async function GET(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const mains = getAllRoutes().filter((r) => r.type === 'main');
  const subs = toSavedRoutes(readGraph());
  return NextResponse.json([...subs, ...mains]);
}

export async function POST(req: Request) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Omit<SavedRoute, 'id' | 'created_at' | 'updated_at'>;
  const now = new Date().toISOString();

  if (body.type === 'main') {
    const route: SavedRoute = { ...body, id: uuidv4(), created_at: now, updated_at: now };
    return NextResponse.json(createRoute(route), { status: 201 });
  }

  // Sub-route fallback path (no junction review): compile-and-apply with no
  // accepted proposals. The admin flow goes through /api/graph/subroutes.
  if (!body.geometry || body.geometry.coordinates.length < 2) {
    return NextResponse.json({ error: 'geometry required for sub-routes' }, { status: 400 });
  }
  const { geometry, points, type: _type, sub_route_ids: _s, sub_route_segments: _g, ...meta } = body;
  const graph = readGraph();
  const def = applySubroute(graph, { geometry, points: points ?? [], meta }, []);
  writeGraph(graph);
  const saved = toSavedRoutes(graph).find((r) => r.id === def.id)!;
  return NextResponse.json(saved, { status: 201 });
}
