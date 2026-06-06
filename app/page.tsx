'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  Lock, MapPin, ChevronLeft, ChevronRight, Navigation,
  Copy, Check, Search, X, Layers, Menu,
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
        'w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm active:scale-[0.98] min-h-[72px]',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/40 hover:bg-accent/50'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 shadow-sm"
          style={{ backgroundColor: route.color }}
        />
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-base font-semibold leading-snug',
            selected ? 'text-primary' : 'text-foreground'
          )}>
            {route.name}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {route.type === 'main' ? (
              <span className="text-sm text-primary font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                {route.sub_route_ids?.length ?? 0} sub-routes
              </span>
            ) : (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {route.points.length} points
              </span>
            )}
            {category && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: category.color + '20', color: category.color }}
              >
                {category.name}
              </span>
            )}
          </div>
          {route.description && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{route.description}</p>
          )}
        </div>
        {selected && (
          <ChevronRight className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        )}
      </div>
    </button>
  );
}

// ── Route sidebar ─────────────────────────────────────────────────────────────

function RouteSidebar({ onClose }: { onClose?: () => void }) {
  const {
    savedRoutes, selectedRouteId, categories, categoryFilter,
    sidebarCheckpostFilter, setSidebarCheckpostFilter,
    setCategoryFilter, selectRoute,
  } = useRouteBuilderStore();

  const [collapsed, setCollapsed] = useState(false);
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    let routes = savedRoutes.filter(r => r.type === 'main');
    if (categoryFilter) routes = routes.filter(r => r.category_id === categoryFilter);
    if (sidebarCheckpostFilter === 'with') routes = routes.filter(r => r.has_checkpost === true);
    if (sidebarCheckpostFilter === 'without') routes = routes.filter(r => r.has_checkpost !== true);
    return routes;
  }, [savedRoutes, categoryFilter, sidebarCheckpostFilter]);

  if (collapsed && !onClose) {
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
          {savedRoutes.filter(r => r.type === 'main').map(r => (
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
    <div className={cn(
      'flex flex-col h-full bg-background/95 backdrop-blur-sm border-border flex-shrink-0 z-10',
      onClose ? 'w-full' : 'w-72 border-r'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border flex-shrink-0">
        <div>
          <h2 className="font-bold text-base text-foreground">Field Routes</h2>
          <p className="text-sm text-muted-foreground">
            {savedRoutes.filter(r => r.type === 'main').length} route{savedRoutes.filter(r => r.type === 'main').length !== 1 ? 's' : ''} available
          </p>
        </div>
        {onClose ? (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 -mr-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Collapse">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      {categories.length > 0 && (
        <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCategoryFilter(null)}
              className={cn(
                'text-sm px-3 py-1.5 rounded-full border font-medium transition-colors min-h-[36px]',
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
                  'text-sm px-3 py-1.5 rounded-full border font-medium transition-colors min-h-[36px]',
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
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex gap-2">
          {(['all', 'with', 'without'] as const).map(f => (
            <button
              key={f}
              onClick={() => setSidebarCheckpostFilter(f)}
              className={cn(
                'text-sm px-3 py-2 rounded-full border font-medium transition-colors flex-1 min-h-[40px]',
                sidebarCheckpostFilter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {f === 'all' ? 'All' : f === 'with' ? 'Checkpost' : 'No Checkpost'}
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
    <div className="absolute top-3 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-80 z-10">
      <div className="bg-background/95 backdrop-blur-sm rounded-xl border shadow-lg px-3 py-2 space-y-1">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Coordinates: lat, lng"
              className="h-11 text-sm pl-9"
            />
          </div>
          <Button
            size="sm"
            className="h-11 w-11 p-0 flex-shrink-0"
            onClick={handleSearch}
            disabled={!parsed}
            title="Go to coordinate"
          >
            <Navigation className="w-4 h-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
    <div className="absolute bottom-24 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-10">
      <div className="bg-background/95 backdrop-blur-sm rounded-xl border shadow-lg px-4 py-3 flex items-center gap-3">
        <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tapped Location</p>
          <p className="text-base font-mono font-semibold text-foreground truncate">{coordText}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-2.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Copy coordinates"
          >
            {copied
              ? <Check className="w-4 h-4 text-green-500" />
              : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setClickedCoord(null)}
            className="p-2.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
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
  const { selectedRouteId, selectRoute } = useRouteBuilderStore();
  const [mobileListOpen, setMobileListOpen] = useState(false);

  if (!viewKey) return <AuthGate />;

  const hasDetail = !!selectedRouteId;

  const closeMobileList = () => setMobileListOpen(false);
  const openMobileList = () => setMobileListOpen(true);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <DataLoader />

      {/* Desktop: left collapsible sidebar */}
      <div className="hidden md:flex h-full flex-shrink-0">
        <RouteSidebar />
      </div>

      {/* Map + overlays (always full-width on mobile) */}
      <div className="flex-1 relative min-w-0">
        <MapView />
        <CoordSearch />
        {!hasDetail && <LocationInfo />}

        {/* Mobile: FAB to open route list (only when no detail open) */}
        {!hasDetail && !mobileListOpen && (
          <button
            onClick={openMobileList}
            className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-primary text-primary-foreground rounded-full px-6 py-3.5 shadow-xl flex items-center gap-2.5 text-base font-semibold min-h-[52px] active:scale-95 transition-transform"
          >
            <Layers className="w-5 h-5" />
            View Routes
          </button>
        )}

        {/* Mobile: back button when detail is open */}
        {hasDetail && (
          <button
            onClick={() => selectRoute(null)}
            className="md:hidden absolute top-[72px] left-3 z-20 bg-background/95 backdrop-blur-sm border border-border rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 text-sm font-semibold min-h-[44px] active:scale-95 transition-transform"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
      </div>

      {/* Desktop: right detail panel */}
      {hasDetail && (
        <div className="hidden md:flex h-full flex-shrink-0 shadow-2xl z-10">
          <RouteDetailPanel />
        </div>
      )}

      {/* Mobile: route list bottom sheet */}
      {mobileListOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={closeMobileList}
          />
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[82vh] rounded-t-2xl overflow-hidden shadow-2xl flex flex-col bg-background">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <RouteSidebar onClose={closeMobileList} />
          </div>
        </>
      )}

      {/* Mobile: detail bottom sheet */}
      {hasDetail && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/20"
            onClick={() => selectRoute(null)}
          />
          <div className="md:hidden fixed inset-x-0 bottom-0 z-50 h-[85vh] rounded-t-2xl overflow-hidden shadow-2xl flex flex-col bg-background">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <RouteDetailPanel />
          </div>
        </>
      )}
    </div>
  );
}
