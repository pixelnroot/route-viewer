'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus, Trash2, ChevronDown, ChevronUp, Tag,
  LogOut, Shield, Route, Loader2, AlertCircle, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import RouteBuilder from '@/components/routes/RouteBuilder';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { cn } from '@/lib/utils';
import type { SavedRoute, Category } from '@/types/routes';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

// ── constants ─────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
];

// ── Admin gate ────────────────────────────────────────────────────────────────

function AdminGate({ onAuth }: { onAuth: (key: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = (inputRef.current?.value ?? '').trim();
    if (!key) { setError('Enter your admin key.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/routes', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        onAuth(key);
      } else {
        setError('Invalid admin key.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 space-y-8">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
            <p className="text-sm text-muted-foreground mt-1">Field Route Intelligence</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder="Edit / Admin Key"
            className="h-11 text-base"
            autoFocus
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Enter Admin Panel'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Route card ────────────────────────────────────────────────────────────────

function RouteCard({
  route, selected, category, editKey, onSelect, onDelete,
}: {
  route: SavedRoute;
  selected: boolean;
  category?: Category;
  editKey: string;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/routes/${route.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editKey}` },
      });
      onDelete();
    } catch {}
    setDeleting(false);
    setConfirming(false);
  };

  return (
    <div className={cn(
      'rounded-md border p-2.5 transition-colors',
      selected ? 'border-primary bg-accent' : 'border-border'
    )}>
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-start gap-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: route.color }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{route.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">{route.points.length} pts</span>
              {category && (
                <span
                  className="text-[10px] font-medium px-1 rounded"
                  style={{ backgroundColor: category.color + '30', color: category.color }}
                >
                  {category.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-1.5 text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      ) : (
        <div className="mt-1.5 flex gap-1.5 items-center">
          <span className="text-[10px] text-destructive font-medium">Confirm delete?</span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-[10px] text-destructive font-bold hover:underline"
          >
            {deleting ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[10px] text-muted-foreground hover:underline"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}

// ── Category manager ──────────────────────────────────────────────────────────

function CategoryManager({ editKey }: { editKey: string }) {
  const { categories, addCategory, removeCategory, categoryFilter, setCategoryFilter } =
    useRouteBuilderStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[4]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) throw new Error();
      addCategory(await res.json());
      setName('');
    } catch {
      setError('Failed to create category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editKey}` },
      });
      removeCategory(id);
      if (categoryFilter === id) setCategoryFilter(null);
    } catch {}
  };

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div key={cat.id} className="flex items-center gap-2 px-1">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
          <span className="text-xs flex-1 truncate">{cat.name}</span>
          <button
            onClick={() => handleDelete(cat.id)}
            className="text-muted-foreground hover:text-destructive flex-shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      <form onSubmit={handleCreate} className="space-y-1.5 pt-1 border-t border-border">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="h-7 text-xs"
        />
        <div className="flex gap-1 flex-wrap">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'w-5 h-5 rounded-full border-2 transition-transform',
                color === c ? 'border-foreground scale-110' : 'border-transparent'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
        <Button type="submit" size="sm" className="w-full h-7 text-xs" disabled={!name.trim() || saving}>
          <Plus className="w-3 h-3 mr-1" />
          Add Category
        </Button>
      </form>
    </div>
  );
}

// ── Admin sidebar ─────────────────────────────────────────────────────────────

function AdminSidebar({ editKey, onLogout }: { editKey: string; onLogout: () => void }) {
  const {
    savedRoutes, selectedRouteId, mode,
    categories, categoryFilter,
    setSavedRoutes, setCategories,
    selectRoute, setMode, removeSavedRoute,
    setCategoryFilter, resetBuilder,
  } = useRouteBuilderStore();

  const [showCategories, setShowCategories] = useState(true);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const filteredRoutes = categoryFilter
    ? savedRoutes.filter((r) => r.category_id === categoryFilter)
    : savedRoutes;

  useEffect(() => {
    const headers = { Authorization: `Bearer ${editKey}` };
    fetch('/api/routes', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setSavedRoutes(d))
      .catch(() => {});
    fetch('/api/categories', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setCategories(d))
      .catch(() => {});
  }, [editKey, setSavedRoutes, setCategories]);

  const handleCreate = () => {
    selectRoute(null);
    resetBuilder();
    setMode('create');
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border w-72">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">Admin Panel</span>
          </div>
          <button
            onClick={onLogout}
            className="text-muted-foreground hover:text-foreground"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="px-3 py-2 flex-shrink-0 border-b border-border">
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setCategoryFilter(null)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                !categoryFilter
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
                className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                  categoryFilter === cat.id
                    ? 'text-white border-transparent'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
                style={categoryFilter === cat.id ? { backgroundColor: cat.color } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create route button */}
      <div className="px-3 py-2 flex-shrink-0">
        <Button
          onClick={handleCreate}
          size="sm"
          className="w-full h-8 text-xs"
          variant={mode === 'create' ? 'secondary' : 'default'}
        >
          <Route className="w-3.5 h-3.5 mr-1.5" />
          {mode === 'create' ? 'Creating Route…' : 'Create Route'}
        </Button>
      </div>

      <Separator />

      {/* Route list */}
      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-3 space-y-2">
          {filteredRoutes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {categoryFilter ? 'No routes in this category.' : 'No routes yet.'}
            </p>
          ) : (
            filteredRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                selected={selectedRouteId === route.id}
                category={route.category_id ? catMap.get(route.category_id) : undefined}
                editKey={editKey}
                onSelect={() => { setMode('view'); selectRoute(route.id); }}
                onDelete={() => { removeSavedRoute(route.id); if (selectedRouteId === route.id) selectRoute(null); }}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Category manager */}
      <div className="flex-shrink-0">
        <button
          onClick={() => setShowCategories((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
        >
          <span className="flex items-center gap-1.5">
            <Tag className="w-3 h-3" />
            Categories ({categories.length})
          </span>
          {showCategories ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {showCategories && (
          <div className="px-3 pb-3">
            <CategoryManager editKey={editKey} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin route detail (read + delete) ────────────────────────────────────────

function AdminRouteDetail({ editKey }: { editKey: string }) {
  const { selectedRouteId, savedRoutes, categories, selectRoute, removeSavedRoute, loadRouteForEdit } =
    useRouteBuilderStore();
  const route = savedRoutes.find((r) => r.id === selectedRouteId);
  if (!route) return null;

  const sorted = [...route.points].sort((a, b) => a.order - b.order);
  const category = route.category_id ? categories.find((c) => c.id === route.category_id) : null;
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editKey}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      removeSavedRoute(route.id);
      selectRoute(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-80">
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2 min-w-0 flex-1 mr-2">
          <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: route.color }} />
          <span className="font-semibold text-sm leading-snug">{route.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => loadRouteForEdit(route)}
            className="text-muted-foreground hover:text-primary"
            title="Edit route"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => selectRoute(null)} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-4">
          {category && (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" style={{ borderColor: category.color, color: category.color }}>
                {category.name}
              </Badge>
            </div>
          )}

          {route.description && (
            <p className="text-sm text-muted-foreground">{route.description}</p>
          )}

          <Separator />

          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Points ({sorted.length})
            </p>
            <div className="space-y-2">
              {sorted.map((pt, i) => (
                <div key={pt.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold',
                      pt.type === 'start' ? 'bg-green-500' :
                      pt.type === 'poi' ? 'bg-yellow-500' :
                      pt.type === 'destination' ? 'bg-red-500' : 'bg-blue-500'
                    )}>
                      {pt.icon ?? (i + 1)}
                    </div>
                    {i < sorted.length - 1 && <div className="w-px h-3 bg-border mt-0.5" />}
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="text-xs font-medium truncate">{pt.label}</p>
                    {pt.category && <p className="text-[10px] text-muted-foreground capitalize">{pt.category}</p>}
                    <p className="text-[10px] font-mono text-muted-foreground">
                      {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                    </p>
                    {pt.note && <p className="text-[10px] text-muted-foreground italic mt-0.5">{pt.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Delete */}
          <section className="space-y-2 pb-2">
            {error && (
              <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/10 rounded p-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </div>
            )}
            {confirm ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-2">
                <p className="text-xs text-destructive font-medium">Delete this route?</p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => setConfirm(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="w-full h-8 text-xs"
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Route
              </Button>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { editKey, setEditKey, clearKeys } = useAuthStore();
  const { mode, selectedRouteId, editingRouteId, resetBuilder, setMode } = useRouteBuilderStore();

  const handleAuth = (key: string) => setEditKey(key);
  const handleLogout = () => {
    clearKeys();
    resetBuilder();
    setMode('view');
  };

  if (!editKey) return <AdminGate onAuth={handleAuth} />;

  const showBuilder = mode === 'create';
  const showDetail = mode === 'view' && !!selectedRouteId && !editingRouteId;
  const showRight = showBuilder || showDetail;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <AdminSidebar editKey={editKey} onLogout={handleLogout} />

      <div className="flex-1 relative">
        <MapView />
      </div>

      {showRight && (
        <div className="h-full flex-shrink-0">
          {showBuilder && <RouteBuilder />}
          {showDetail && <AdminRouteDetail editKey={editKey} />}
        </div>
      )}
    </div>
  );
}
