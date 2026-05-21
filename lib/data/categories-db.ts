import fs from 'fs';
import path from 'path';
import type { Category } from '@/types/routes';

const DB_PATH = path.join(process.cwd(), 'data', 'categories.json');

function readAll(): Category[] {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as Category[];
  } catch {
    return [];
  }
}

function writeAll(cats: Category[]): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(cats, null, 2));
}

export function getAllCategories(): Category[] {
  return readAll();
}

export function createCategory(cat: Category): Category {
  const all = readAll();
  all.push(cat);
  writeAll(all);
  return cat;
}

export function updateCategory(id: string, patch: Partial<Category>): Category | null {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, id };
  writeAll(all);
  return all[idx];
}

export function deleteCategory(id: string): boolean {
  const all = readAll();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  writeAll(filtered);
  return true;
}
