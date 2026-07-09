import { NextResponse } from 'next/server';
import { canEdit } from '@/lib/auth';
import { readGraph, writeGraph, getSubroute } from '@/lib/data/graph-db';
import { removeSubroute } from '@/lib/graph/compiler';
import type { SubRouteDef } from '@/types/graph';

// PUT /api/graph/subroutes/[id] → patch meta/points only (geometry changes go
// through compile → POST /api/graph/subroutes with draft.id set)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  const def = getSubroute(graph, id);
  if (!def) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch = (await req.json()) as Partial<SubRouteDef>;
  // topology fields are not patchable here
  delete patch.id;
  delete patch.edgeIds;
  Object.assign(def, patch, { updated_at: new Date().toISOString() });
  writeGraph(graph);
  return NextResponse.json(def);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  if (!getSubroute(graph, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  removeSubroute(graph, id);
  writeGraph(graph);
  return NextResponse.json({ success: true });
}
