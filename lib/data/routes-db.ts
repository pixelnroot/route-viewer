import fs from 'fs';
import path from 'path';
import type { SavedRoute } from '@/types/routes';

// File-based JSON store — swap readAll/writeAll for PostGIS queries later.
const DB_PATH = path.join(process.cwd(), 'data', 'routes.json');

function readAll(): SavedRoute[] {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw) as SavedRoute[];
  } catch {
    return [];
  }
}

function writeAll(routes: SavedRoute[]): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(routes, null, 2));
}

export function getAllRoutes(): SavedRoute[] {
  return readAll();
}

export function getRouteById(id: string): SavedRoute | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function createRoute(route: SavedRoute): SavedRoute {
  const all = readAll();
  all.push(route);
  writeAll(all);
  return route;
}

export function updateRoute(id: string, patch: Partial<SavedRoute>): SavedRoute | null {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, id, updated_at: new Date().toISOString() };
  writeAll(all);
  return all[idx];
}

export function deleteRoute(id: string): boolean {
  const all = readAll();
  const filtered = all.filter((r) => r.id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}
