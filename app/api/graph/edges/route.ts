import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { canEdit } from '@/lib/auth';
import { readGraph, writeGraph, getNode } from '@/lib/data/graph-db';
import { lineDistance, type Coord } from '@/lib/graph/geometry';
import type { GraphSegmentEdge } from '@/types/graph';

interface BridgeBody {
  fromNodeId: string;
  toNodeId: string;
  geometry: GeoJSON.LineString;
  duration?: number;
  suggestionId?: string; // connector suggestion being resolved, if any
}

// POST /api/graph/edges → persist a bridge (connector) edge between two nodes
export async function POST(req: Request) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as BridgeBody;
  const graph = readGraph();
  const from = getNode(graph, body.fromNodeId);
  const to = getNode(graph, body.toNodeId);
  if (!from || !to) return NextResponse.json({ error: 'fromNodeId/toNodeId not found' }, { status: 404 });
  if (!body.geometry?.coordinates || body.geometry.coordinates.length < 2) {
    return NextResponse.json({ error: 'geometry with >= 2 coordinates required' }, { status: 400 });
  }

  const edge: GraphSegmentEdge = {
    id: uuidv4(),
    fromNodeId: from.id,
    toNodeId: to.id,
    geometry: body.geometry,
    distance: lineDistance(body.geometry.coordinates as Coord[]),
    duration: body.duration,
    oneway: false,
    source: 'bridge',
    subrouteIds: [],
  };
  graph.edges.push(edge);
  if (body.suggestionId) {
    graph.suggestions = graph.suggestions.filter((s) => s.id !== body.suggestionId);
  }
  writeGraph(graph);
  return NextResponse.json(edge, { status: 201 });
}
