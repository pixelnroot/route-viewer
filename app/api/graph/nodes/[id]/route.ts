import { NextResponse } from 'next/server';
import { canEdit } from '@/lib/auth';
import { readGraph, writeGraph, getNode, nodeDegree } from '@/lib/data/graph-db';

// PUT /api/graph/nodes/[id] → rename / toggle showInFinder / change kind,
// or merge another node into this one: { mergeNodeId: string }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  const node = getNode(graph, id);
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json()) as { name?: string; showInFinder?: boolean; kind?: 'place' | 'junction'; mergeNodeId?: string };

  if (body.mergeNodeId) {
    const other = getNode(graph, body.mergeNodeId);
    if (!other) return NextResponse.json({ error: 'mergeNodeId not found' }, { status: 404 });
    if (other.id === node.id) return NextResponse.json({ error: 'cannot merge node into itself' }, { status: 400 });
    for (const e of graph.edges) {
      if (e.fromNodeId === other.id) e.fromNodeId = node.id;
      if (e.toNodeId === other.id) e.toNodeId = node.id;
    }
    if (other.showInFinder) node.showInFinder = true;
    graph.nodes = graph.nodes.filter((n) => n.id !== other.id);
    graph.suggestions = graph.suggestions.filter((s) => s.nodeAId !== other.id && s.nodeBId !== other.id);
  }

  if (body.name !== undefined) node.name = body.name || undefined;
  if (body.showInFinder !== undefined) node.showInFinder = body.showInFinder;
  if (body.kind !== undefined) node.kind = body.kind;

  writeGraph(graph);
  return NextResponse.json(node);
}

// DELETE → only degree-0 nodes
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const graph = readGraph();
  if (!getNode(graph, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (nodeDegree(graph, id) > 0) {
    return NextResponse.json({ error: 'Node has connected edges' }, { status: 409 });
  }
  graph.nodes = graph.nodes.filter((n) => n.id !== id);
  graph.suggestions = graph.suggestions.filter((s) => s.nodeAId !== id && s.nodeBId !== id);
  writeGraph(graph);
  return NextResponse.json({ success: true });
}
