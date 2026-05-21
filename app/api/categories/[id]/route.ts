import { NextResponse } from 'next/server';
import { updateCategory, deleteCategory } from '@/lib/data/categories-db';
import type { Category } from '@/types/routes';

function editAuth(req: Request) {
  const key = process.env.EDIT_ADMIN_KEY;
  return !key || req.headers.get('Authorization') === `Bearer ${key}`;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!editAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as Partial<Category>;
  const updated = updateCategory(id, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!editAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const ok = deleteCategory(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
