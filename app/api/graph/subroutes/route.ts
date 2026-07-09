import { NextResponse } from 'next/server';
import { canEdit } from '@/lib/auth';
import { readGraph, writeGraph, toSavedRoutes } from '@/lib/data/graph-db';
import { applySubroute, type SubrouteDraft, type JunctionProposal } from '@/lib/graph/compiler';

interface ApplyBody {
  draft: SubrouteDraft;
  acceptedProposals?: JunctionProposal[];
}

// POST /api/graph/subroutes → apply a compiled draft (create or replace topology)
export async function POST(req: Request) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as ApplyBody;
  const { draft, acceptedProposals = [] } = body;
  if (!draft?.geometry?.coordinates || draft.geometry.coordinates.length < 2) {
    return NextResponse.json({ error: 'draft.geometry with >= 2 coordinates required' }, { status: 400 });
  }
  if (!draft.meta?.name) {
    return NextResponse.json({ error: 'draft.meta.name required' }, { status: 400 });
  }

  const graph = readGraph();
  const def = applySubroute(graph, draft, acceptedProposals);
  writeGraph(graph);
  // savedRoute: legacy shape for the client-side savedRoutes store
  const savedRoute = toSavedRoutes(graph).find((r) => r.id === def.id) ?? null;
  return NextResponse.json({ def, savedRoute }, { status: draft.id ? 200 : 201 });
}
