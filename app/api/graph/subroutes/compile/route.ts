import { NextResponse } from 'next/server';
import { canEdit } from '@/lib/auth';
import { readGraph } from '@/lib/data/graph-db';
import { compileSubroute, type SubrouteDraft } from '@/lib/graph/compiler';

// POST /api/graph/subroutes/compile → dry-run: endpoint snaps + junction proposals
export async function POST(req: Request) {
  if (!canEdit(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = (await req.json()) as SubrouteDraft;
  if (!draft?.geometry?.coordinates || draft.geometry.coordinates.length < 2) {
    return NextResponse.json({ error: 'draft.geometry with >= 2 coordinates required' }, { status: 400 });
  }
  return NextResponse.json(compileSubroute(readGraph(), draft));
}
