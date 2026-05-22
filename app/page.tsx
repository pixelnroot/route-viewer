'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Lock, MapPin, ChevronLeft, ChevronRight, Navigation,
  Copy, Check, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import RouteDetailPanel from '@/components/routes/RouteDetailPanel';
import { cn } from '@/lib/utils';
import type { SavedRoute, Category } from '@/types/routes';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

// ── Auth gate ─────────────────────────────────────────────────────────────────

function AuthGate() {
  const { setViewKey } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = (inputRef.current?.value ?? '').trim();
    if (!key) { setError('Enter your view key.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/routes', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        setViewKey(key);
      } else {
        setError('Invalid key. Try again.');
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
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Field Route Intelligence</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your view key to access the map.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            ref={inputRef}
            type="password"
            placeholder="View Key"
            className="h-11 text-base"
            autoFocus
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
            {loading ? 'Verifying…' : 'Access Map'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Route card ────────────────────────────────────────────────────────────────

function RouteCard({
  route, selected, category, onClick,
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
        'w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/40 hover:bg-accent/50'
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
          style={{ backgroundColor: route.color }}
        />
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-sm font-semibold leading-snug',
            selected ? 'text-primary' : 'text-foreground'
          )}>
            {route.name}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <MapPin className="w-3 h-3" />
              {route.points.length} points
            </span>
            {category && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: category.color + '20', color: category.color }}
              >
                {category.name}
              </span>
            )}
          </div>
          {route.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{route.description}</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Route sidebar ─────────────────────────────────────────────────────────────

function RouteSidebar() {
  const {
    savedRoutes, selectedRouteId, categories, categoryFilter,
    setCategoryFilter, selectRoute,
  } = useRouteBuilderStore();

  const [collapsed, setCollapsed] = useState(false);
  const [checkpostFilter, setCheckpostFilter] = useState<'all' | 'with' | 'without'>('all');
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    let routes = categoryFilter
      ? savedRoutes.filter(r => r.category_id === categoryFilter)
      : savedRoutes;
    if (checkpostFilter === 'with') routes = routes.filter(r => r.points.some(p => p.type === 'poi'));
    if (checkpostFilter === 'without') routes = routes.filter(r => !r.points.some(p => p.type === 'poi'));
    return routes;
  }, [savedRoutes, categoryFilter, checkpostFilter]);

  if (collapsed) {
    return (
      <div className="flex flex-col h-full bg-background/95 backdrop-blur-sm border-r border-border w-10 flex-shrink-0 z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground"
          title="Expand route list"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="flex-1 flex flex-col items-center gap-2 pt-2 overflow-hidden">
          {savedRoutes.map(r => (
            <button
              key={r.id}
              onClick={() => selectRoute(r.id)}
              title={r.name}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0',
                selectedRouteId === r.id ? 'border-foreground scale-110' : 'border-transparent'
              )}
              style={{ backgroundColor: r.color }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-sm border-r border-border w-72 flex-shrink-0 z-10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <h2 className="font-bold text-sm text-foreground">Field Routes</h2>
          <p className="text-xs text-muted-foreground">
            {savedRoutes.length} route{savedRoutes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setCategoryFilter(null)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                !categoryFilter
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
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

      {/* Checkpost filter */}
      <div className="px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex gap-1.5">
          {(['all', 'with', 'without'] as const).map(f => (
            <button
              key={f}
              onClick={() => setCheckpostFilter(f)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border font-medium transition-colors flex-1',
                checkpostFilter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {f === 'all' ? 'All' : f === 'with' ? 'With Checkpost' : 'Without'}
            </button>
          ))}
        </div>
      </div>

      {/* Route list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <MapPin className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-xs text-muted-foreground">
                {categoryFilter ? 'No routes in this category.' : 'No routes available.'}
              </p>
            </div>
          ) : (
            filtered.map(route => (
              <RouteCard
                key={route.id}
                route={route}
                selected={selectedRouteId === route.id}
                category={route.category_id ? catMap.get(route.category_id) : undefined}
                onClick={() => selectRoute(selectedRouteId === route.id ? null : route.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Coordinate search overlay ─────────────────────────────────────────────────

function parseCoord(input: string): { lat: number; lng: number } | null {
  const parts = input.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function CoordSearch() {
  const { flyTo, setClickedCoord } = useRouteBuilderStore();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const parsed = useMemo(() => parseCoord(input), [input]);

  const handleSearch = () => {
    if (!parsed) { setError('Invalid — use: lat, lng'); return; }
    setError('');
    flyTo(parsed.lat, parsed.lng);
    setClickedCoord(parsed);
    setInput('');
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-72">
      <div className="bg-background/95 backdrop-blur-sm rounded-xl border shadow-lg px-3 py-2 space-y-1">
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Search coordinate: lat, lng"
              className="h-8 text-xs pl-7"
            />
          </div>
          <Button
            size="sm"
            className="h-8 w-8 p-0 flex-shrink-0"
            onClick={handleSearch}
            disabled={!parsed}
            title="Go to coordinate"
          >
            <Navigation className="w-3.5 h-3.5" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

// ── Location info panel ────────────────────────────────────────────────────────

function LocationInfo() {
  const { clickedCoord, setClickedCoord } = useRouteBuilderStore();
  const [copied, setCopied] = useState(false);

  if (!clickedCoord) return null;

  const coordText = `${clickedCoord.lat.toFixed(6)}, ${clickedCoord.lng.toFixed(6)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(coordText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
      <div className="bg-background/95 backdrop-blur-sm rounded-xl border shadow-lg px-4 py-3 flex items-center gap-3">
        <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
        <div>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Location</p>
          <p className="text-sm font-mono font-semibold text-foreground">{coordText}</p>
        </div>
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Copy coordinates"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-green-500" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setClickedCoord(null)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Data loader ───────────────────────────────────────────────────────────────

function DataLoader() {
  const { viewKey, clearKeys } = useAuthStore();
  const { setSavedRoutes, setCategories } = useRouteBuilderStore();

  useEffect(() => {
    if (!viewKey) return;
    const headers = { Authorization: `Bearer ${viewKey}` };

    fetch('/api/routes', { headers })
      .then((r) => {
        if (r.status === 401) { clearKeys(); return null; }
        return r.json();
      })
      .then((data) => { if (Array.isArray(data)) setSavedRoutes(data); })
      .catch(() => {});

    fetch('/api/categories', { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  }, [viewKey, setSavedRoutes, setCategories, clearKeys]);

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const { viewKey } = useAuthStore();
  const { selectedRouteId } = useRouteBuilderStore();

  if (!viewKey) return <AuthGate />;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <DataLoader />

      {/* Left: collapsible route list */}
      <RouteSidebar />

      {/* Center: map + overlays */}
      <div className="flex-1 relative min-w-0">
        <MapView />
        <CoordSearch />
        <LocationInfo />
      </div>

      {/* Right: route detail panel */}
      {selectedRouteId && (
        <div className="h-full flex-shrink-0 shadow-2xl z-10">
          <RouteDetailPanel />
        </div>
      )}
    </div>
  );
}
