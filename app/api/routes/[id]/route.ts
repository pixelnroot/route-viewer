import { NextResponse } from 'next/server';
import { getRouteById, updateRoute, deleteRoute } from '@/lib/data/routes-db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const route = getRouteById(id);
  if (!route) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(route);
}

export async function PUT(req: Request, { params }: Params) {
  const authHeader = req.headers.get('Authorization');
  const editKey = process.env.EDIT_ADMIN_KEY;
  if (!editKey || authHeader !== `Bearer ${editKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const updated = updateRoute(id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: Params) {
  const authHeader = req.headers.get('Authorization');
  const editKey = process.env.EDIT_ADMIN_KEY;
  if (!editKey || authHeader !== `Bearer ${editKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const ok = deleteRoute(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
