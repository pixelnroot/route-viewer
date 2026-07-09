'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Navigation, X, ChevronDown, Route, AlertCircle, Loader2, Map, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouteFinderStore } from '@/lib/store/route-finder-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { NamedLocation } from '@/types/graph';

// ── Location combobox ─────────────────────────────────────────────────────────

function LocationCombobox({
  label,
  placeholder,
  value,
  pickedPoint,
  isPicking,
  onChange,
  onPickOnMap,
  locations,
  excludeId,
  icon: Icon,
  iconColor,
}: {
  label: string;
  placeholder: string;
  value: string | null;
  pickedPoint: { lat: number; lng: number } | null;
  isPicking: boolean;
  onChange: (id: string | null) => void;
  onPickOnMap: () => void;
  locations: NamedLocation[];
  excludeId?: string | null;
  icon: React.ElementType;
  iconColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = locations.find((l) => l.id === value) ?? null;
  const displayText = selected
    ? selected.label
    : pickedPoint
    ? `📍 ${pickedPoint.lat.toFixed(5)}, ${pickedPoint.lng.toFixed(5)}`
    : isPicking
    ? 'Click a position on the map…'
    : null;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return locations
      .filter((l) => l.id !== excludeId)
      .filter((l) => !q || l.label.toLowerCase().includes(q))
      .slice(0, 30);
  }, [locations, query, excludeId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (loc: NamedLocation) => {
    onChange(loc.id);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-1">{label}</p>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          'w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-left transition-colors min-h-[44px]',
          open ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-background'
        )}
      >
        <Icon className={cn('w-4 h-4 flex-shrink-0', iconColor)} />
        <span className={cn('flex-1 truncate', selected || pickedPoint ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          {displayText ?? placeholder}
        </span>
        {selected || pickedPoint ? (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent); }}
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-background border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search locations…"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 rounded-md outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onPickOnMap(); setOpen(false); setQuery(''); }}
            className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2 border-b border-border text-primary font-medium"
          >
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            Pick a position on the map
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No locations found</p>
            ) : (
              filtered.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelect(loc)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', iconColor)} />
                  <span className="truncate">{loc.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Main panel ────────────────────────────────────────────────────────────────

export default function RouteFinderPanel() {
  const { viewKey } = useAuthStore();
  const selectRoute = useRouteBuilderStore((s) => s.selectRoute);
  const {
    finderStartId, finderEndId, finderLocations, finderResults,
    finderStartPoint, finderEndPoint, finderPickTarget,
    finderActiveIdx, finderLoading, finderError,
    setFinderStartId, setFinderEndId, setFinderLocations, setFinderPickTarget,
    setFinderResults, setFinderActiveIdx, setFinderLoading, setFinderError, resetFinder,
  } = useRouteFinderStore();

  // Open detail panel (with presentation) for the active finder route
  useEffect(() => {
    if (finderResults.length === 0) { selectRoute(null); return; }
    const active = finderResults[finderActiveIdx];
    const firstSub = active?.segments.find((s) => s.type === 'subroute' && s.subrouteId);
    if (firstSub?.subrouteId) selectRoute(firstSub.subrouteId);
  }, [finderActiveIdx, finderResults, selectRoute]);

  // Load all named locations (re-fetches whenever cache is cleared via setFinderLocations([]))
  useEffect(() => {
    if (!viewKey || finderLocations.length > 0) return;
    fetch('/api/route-finder', { headers: { Authorization: `Bearer ${viewKey}` } })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.locations)) setFinderLocations(data.locations); })
      .catch(() => {});
  }, [viewKey, finderLocations.length, setFinderLocations]);

  // When start changes, clear the selected destination
  const handleStartChange = useCallback((id: string | null) => {
    setFinderStartId(id);
    setFinderEndId(null);
  }, [setFinderStartId, setFinderEndId]);

  const hasStart = !!finderStartId || !!finderStartPoint;
  const hasEnd = !!finderEndId || !!finderEndPoint;

  const handleFind = async () => {
    if (!hasStart || !hasEnd || !viewKey) return;
    setFinderLoading(true);
    setFinderError(null);
    try {
      const res = await fetch('/api/route-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewKey}` },
        body: JSON.stringify({
          startLocationId: finderStartId ?? undefined,
          startPoint: finderStartPoint ?? undefined,
          endLocationId: finderEndId ?? undefined,
          endPoint: finderEndPoint ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setFinderResults(data.routes ?? []);
      if ((data.routes ?? []).length === 0) setFinderError('No routes found between these locations.');
    } catch (e) {
      setFinderError(e instanceof Error ? e.message : 'Failed to find routes');
    } finally {
      setFinderLoading(false);
    }
  };

  const canFind = hasStart && hasEnd && !finderLoading;
  const hasResults = finderResults.length > 0; // used in Clear button condition

  return (
    <div className="absolute top-3 left-3 z-10 w-80 flex flex-col gap-2 pointer-events-none">
      {/* Search card */}
      <div className="bg-background/97 backdrop-blur-md rounded-2xl border border-border shadow-2xl p-4 space-y-3 pointer-events-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Find Route</h2>
          </div>
          {(finderStartId || finderEndId || finderStartPoint || finderEndPoint || finderPickTarget || hasResults) && (
            <button
              onClick={resetFinder}
              className="text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        <LocationCombobox
          label="From"
          placeholder="Select start location"
          value={finderStartId}
          pickedPoint={finderStartPoint}
          isPicking={finderPickTarget === 'start'}
          onChange={handleStartChange}
          onPickOnMap={() => setFinderPickTarget('start')}
          locations={finderLocations}
          excludeId={finderEndId}
          icon={Navigation}
          iconColor="text-green-500"
        />

        <LocationCombobox
          label="To"
          placeholder="Select destination"
          value={finderEndId}
          pickedPoint={finderEndPoint}
          isPicking={finderPickTarget === 'end'}
          onChange={setFinderEndId}
          onPickOnMap={() => setFinderPickTarget('end')}
          locations={finderLocations}
          excludeId={finderStartId}
          icon={Navigation}
          iconColor="text-red-500"
        />

        <button
          type="button"
          onClick={handleFind}
          disabled={!canFind}
          className={cn(
            'w-full h-11 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
            canFind
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {finderLoading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Finding routes…</>
          ) : (
            <><Search className="w-4 h-4" /> Find Routes</>
          )}
        </button>

        {finderError && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{finderError}</span>
          </div>
        )}

        <div className="pt-1 border-t border-border">
          <Link
            href="/covered"
            className="w-full h-9 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent/50 transition-all flex items-center justify-center gap-2"
          >
            <Map className="w-3.5 h-3.5" />
            Show All Covered Area
          </Link>
        </div>
      </div>

    </div>
  );
}
