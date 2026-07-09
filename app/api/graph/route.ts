import { NextResponse } from 'next/server';
import { canRead } from '@/lib/auth';
import { readGraph } from '@/lib/data/graph-db';

// GET /api/graph → full graph for the admin overlay
export async function GET(req: Request) {
  if (!canRead(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(readGraph());
}
