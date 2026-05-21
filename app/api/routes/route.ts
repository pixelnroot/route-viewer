import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllRoutes, createRoute } from '@/lib/data/routes-db';
import type { SavedRoute } from '@/types/routes';

export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const viewKey = process.env.VIEW_ADMIN_KEY;
  if (!viewKey || authHeader !== `Bearer ${viewKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const routes = getAllRoutes();
  return NextResponse.json(routes);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const editKey = process.env.EDIT_ADMIN_KEY;
  if (!editKey || authHeader !== `Bearer ${editKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as Omit<SavedRoute, 'id' | 'created_at' | 'updated_at'>;

  const now = new Date().toISOString();
  const route: SavedRoute = {
    ...body,
    id: uuidv4(),
    created_at: now,
    updated_at: now,
  };

  const saved = createRoute(route);
  return NextResponse.json(saved, { status: 201 });
}
