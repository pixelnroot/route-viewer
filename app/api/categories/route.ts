import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllCategories, createCategory } from '@/lib/data/categories-db';
import type { Category } from '@/types/routes';

function viewAuth(req: Request) {
  const auth = req.headers.get('Authorization');
  const vk = process.env.VIEW_ADMIN_KEY;
  const ek = process.env.EDIT_ADMIN_KEY;
  return (vk && auth === `Bearer ${vk}`) || (ek && auth === `Bearer ${ek}`);
}

function editAuth(req: Request) {
  const key = process.env.EDIT_ADMIN_KEY;
  return !key || req.headers.get('Authorization') === `Bearer ${key}`;
}

export async function GET(req: Request) {
  if (!viewAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getAllCategories());
}

export async function POST(req: Request) {
  if (!editAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json()) as Omit<Category, 'id'>;
  const cat = createCategory({ ...body, id: uuidv4() });
  return NextResponse.json(cat, { status: 201 });
}
