'use client';

import { useEffect, useState } from 'react';
import { Plus, MapPin, ChevronDown, ChevronUp, Trash2, Lock, Unlock, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { SavedRoute, RiskLevel, Category } from '@/types/routes';
import { cn } from '@/lib/utils';

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#64748b',
];

// ── RouteCard ────────────────────────────────────────────────────────────────

function RouteCard({
  route,
  selected,
  category,
  onClick,
}: {
  route: SavedRoute;
  selected: boolean;
  category?: Category;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border p-3 transition-colors hover:bg-accent',
        selected ? 'border-primary bg-accent' : 'border-border'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: route.color }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{route.name}</p>
          {route.description && (
            <p className="text-xs text-muted-foreground truncate">{route.description}</p>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={cn('text-[10px] font-medium', RISK_COLORS[route.risk_level])}>
              {route.risk_level}
            </span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{route.travel_mode}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{route.points.length} pts</span>
            {category && (
              <>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span
                  className="text-[10px] font-medium px-1 rounded"
                  style={{ backgroundColor: category.color + '30', color: category.color }}
                >
                  {category.name}
                </span>
              </>
            )}
          </div>
        </div>
        <Badge
          variant={route.status === 'active' ? 'default' : 'outline'}
          className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
        >
          {route.status}
        </Badge>
      </div>
    </button>
  );
}

// ── CategoryManager ──────────────────────────────────────────────────────────

function CategoryManager({ editKey }: { editKey: string | null }) {
  const { categories, addCategory, removeCategory } = useRouteBuilderStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[4]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { viewKey } = useAuthStore();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !editKey) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${editKey}`,
        },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (res.status === 401) throw new Error('Invalid edit key');
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const cat = await res.json();
      addCategory(cat);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!editKey) return;
    try {
      await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editKey}` },
      });
      removeCategory(id);
    } catch {}
  };

  return (
    <div className="space-y-2">
      {categories.length > 0 && (
        <div className="space-y-1">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 px-1">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-xs flex-1 truncate">{cat.name}</span>
              {editKey && (
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editKey && (
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
      )}

      {!editKey && categories.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">No categories yet.</p>
      )}
    </div>
  );
}

// ── RouteSidebar ─────────────────────────────────────────────────────────────

export default function RouteSidebar() {
  const {
    savedRoutes, selectedRouteId, mode, categories, categoryFilter,
    setSavedRoutes, setCategories, selectRoute, setMode, setCategoryFilter,
  } = useRouteBuilderStore();
  const { viewKey, editKey, setViewKey, setEditKey, clearKeys } = useAuthStore();

  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [editKeyInput, setEditKeyInput] = useState('');
  const [viewKeyInput, setViewKeyInput] = useState('');
  const [viewKeyError, setViewKeyError] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // Load routes
  useEffect(() => {
    if (!viewKey) return;
    fetch('/api/routes', { headers: { Authorization: `Bearer ${viewKey}` } })
      .then((r) => {
        if (r.status === 401) { clearKeys(); return []; }
        return r.json();
      })
      .then((data) => { if (Array.isArray(data)) setSavedRoutes(data); })
      .catch(() => {});
  }, [setSavedRoutes, viewKey, clearKeys]);

  // Load categories
  useEffect(() => {
    if (!viewKey) return;
    fetch('/api/categories', { headers: { Authorization: `Bearer ${viewKey}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  }, [setCategories, viewKey]);

  const handleViewKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setViewKeyError('');
    try {
      const res = await fetch('/api/routes', {
        headers: { Authorization: `Bearer ${viewKeyInput}` },
      });
      if (res.ok) {
        setViewKey(viewKeyInput);
        setViewKeyInput('');
      } else {
        setViewKeyError('Invalid key');
      }
    } catch {
      setViewKeyError('Connection error');
    }
  };

  const handleCreateRoute = () => {
    if (!editKey) { setShowEditPrompt(true); return; }
    selectRoute(null);
    setMode('create');
  };

  const submitEditKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (editKeyInput.trim()) {
      setEditKey(editKeyInput.trim());
      setEditKeyInput('');
      setShowEditPrompt(false);
      selectRoute(null);
      setMode('create');
    }
  };

  const filteredRoutes = categoryFilter
    ? savedRoutes.filter((r) => r.category_id === categoryFilter)
    : savedRoutes;

  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col h-full bg-background border-r border-border w-64">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h1 className="font-bold text-sm">Field Routes</h1>
          </div>
          {viewKey ? (
            <button
              onClick={() => clearKeys()}
              className="text-muted-foreground hover:text-foreground"
              title="Clear session keys"
            >
              <Unlock className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Inline auth — shown when no viewKey */}
      {!viewKey && (
        <div className="px-3 py-3 flex-shrink-0 border-b border-border space-y-2">
          <p className="text-xs text-muted-foreground">Enter key to load routes.</p>
          <form onSubmit={handleViewKeySubmit} className="flex gap-2">
            <Input
              type="password"
              placeholder="View Key"
              className="h-8 text-xs flex-1"
              value={viewKeyInput}
              onChange={(e) => setViewKeyInput(e.target.value)}
            />
            <Button type="submit" size="sm" className="h-8">Go</Button>
          </form>
          {viewKeyError && <p className="text-[10px] text-destructive">{viewKeyError}</p>}
        </div>
      )}

      {/* Category filter chips */}
      {viewKey && categories.length > 0 && (
        <div className="px-3 pt-2 pb-1 flex-shrink-0 border-b border-border">
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
                style={
                  categoryFilter === cat.id
                    ? { backgroundColor: cat.color, borderColor: cat.color }
                    : {}
                }
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create + edit key prompt */}
      <div className="px-3 py-2 flex-shrink-0 space-y-2">
        <Button
          onClick={handleCreateRoute}
          size="sm"
          className="w-full h-8 text-xs"
          variant={mode === 'create' ? 'secondary' : 'default'}
          disabled={!viewKey}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Route
        </Button>
        {showEditPrompt && (
          <form onSubmit={submitEditKey} className="flex gap-2">
            <Input
              type="password"
              placeholder="Edit Key"
              className="h-8 text-xs"
              value={editKeyInput}
              onChange={(e) => setEditKeyInput(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm" className="h-8">OK</Button>
          </form>
        )}
      </div>

      <Separator />

      {/* Route list */}
      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-3 space-y-2">
          {!viewKey ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Enter view key above to load routes.
            </p>
          ) : filteredRoutes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              {categoryFilter ? 'No routes in this category.' : 'No routes saved yet.'}
              <br />
              {!categoryFilter && 'Create your first route.'}
            </p>
          ) : (
            filteredRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                selected={selectedRouteId === route.id}
                category={route.category_id ? catMap.get(route.category_id) : undefined}
                onClick={() => selectRoute(route.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Category manager — collapsible */}
      {viewKey && (
        <div className="flex-shrink-0">
          <button
            onClick={() => setShowCategoryManager((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
          >
            <span className="flex items-center gap-1.5">
              <Tag className="w-3 h-3" />
              Categories ({categories.length})
            </span>
            {showCategoryManager ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showCategoryManager && (
            <div className="px-3 pb-3">
              <CategoryManager editKey={editKey} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
