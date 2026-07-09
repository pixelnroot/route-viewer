import { NextResponse } from 'next/server';
import { getRouteById, updateRoute, deleteRoute } from '@/lib/data/routes-db';
import { readGraph, writeGraph, toSavedRoutes, getSubroute } from '@/lib/data/graph-db';
import { applySubroute, removeSubroute } from '@/lib/graph/compiler';
import { canEdit } from '@/lib/auth';
import type { SavedRoute } from '@/types/routes';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const graph = readGraph();
  if (getSubroute(graph, id)) {
    const route = toSavedRoutes(graph).find((r) => r.id === id)!;
    return NextResponse.json(route);
  }
  const route = getRouteById(id);
  if (!route || route.type !== 'main') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(route);
}

export async function PUT(req: Request, { params }: Params) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as Partial<SavedRoute>;

  const graph = readGraph();
  const def = getSubroute(graph, id);
  if (def) {
    if (body.geometry && body.geometry.coordinates.length >= 2) {
      // geometry change → recompile topology (no junction review on this
      // fallback path; the admin flow uses /api/graph/subroutes)
      const { geometry, points, type: _t, sub_route_ids: _s, sub_route_segments: _g, id: _i, created_at: _c, updated_at: _u, ...metaPatch } = body;
      const { edgeIds: _e, points: defPoints, id: _di, created_at: _dc, updated_at: _du, ...defMeta } = def;
      applySubroute(graph, {
        id,
        geometry,
        points: points ?? defPoints,
        meta: { ...defMeta, ...metaPatch },
      }, []);
    } else {
      const { geometry: _geo, type: _t, sub_route_ids: _s, sub_route_segments: _g, id: _i, created_at: _c, updated_at: _u, edgeIds: _e, ...patch } = body as Partial<SavedRoute> & { edgeIds?: string[] };
      Object.assign(def, patch, { updated_at: new Date().toISOString() });
    }
    writeGraph(graph);
    return NextResponse.json(toSavedRoutes(graph).find((r) => r.id === id)!);
  }

  const updated = updateRoute(id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: Params) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const graph = readGraph();
  if (getSubroute(graph, id)) {
    removeSubroute(graph, id);
    writeGraph(graph);
    return NextResponse.json({ success: true });
  }
  const ok = deleteRoute(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
