import { NextResponse } from 'next/server';
import { canEdit } from '@/lib/auth';
import { readGraph, writeGraph, getEdge } from '@/lib/data/graph-db';

// PUT /api/graph/edges/[id] → { oneway?: boolean }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  const edge = getEdge(graph, id);
  if (!edge) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json()) as { oneway?: boolean };
  if (body.oneway !== undefined) edge.oneway = body.oneway;
  writeGraph(graph);
  return NextResponse.json(edge);
}

// DELETE → bridge edges only; drawn edges are owned by their sub-route
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  const edge = getEdge(graph, id);
  if (!edge) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (edge.source !== 'bridge') {
    return NextResponse.json({ error: 'Only bridge edges can be deleted directly' }, { status: 409 });
  }
  graph.edges = graph.edges.filter((e) => e.id !== id);
  writeGraph(graph);
  return NextResponse.json({ success: true });
}
