'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, X, MapPin, Route } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouter } from 'next/navigation';
import type { SavedRoute } from '@/types/routes';

const CoveredMapView = dynamic(() => import('@/components/covered/CoveredMapView'), { ssr: false });

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function routeDistance(route: SavedRoute): number {
  if (!route.geometry?.coordinates?.length) return 0;
  const coords = route.geometry.coordinates as [number, number][];
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return d;
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

const POINT_TYPE_COLORS: Record<string, string> = {
  start: 'bg-green-500',
  waypoint: 'bg-blue-500',
  poi: 'bg-yellow-500',
  destination: 'bg-red-500',
};

function DetailPanel({ route, onClose }: { route: SavedRoute; onClose: () => void }) {
  const dist = routeDistance(route);
  const points = [...route.points].sort((a, b) => a.order - b.order);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-background border-l border-border shadow-2xl z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b border-border">
        <div className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: route.color }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground leading-snug">{route.name}</h2>
          {dist > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatDist(dist)}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground flex-shrink-0 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Points */}
      <div className="flex-1 overflow-y-auto p-4">
        {points.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No named points</p>
        ) : (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Points ({points.length})
            </p>
            {points.map((pt, i) => (
              <div key={pt.id} className="flex items-start gap-2.5 py-1.5">
                <div className="relative flex-shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 ${POINT_TYPE_COLORS[pt.type] ?? 'bg-gray-400'}`} />
                  {i < points.length - 1 && (
                    <div className="absolute left-1 top-3 w-px h-4 bg-border" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug">{pt.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                    {pt.type}{pt.category ? ` · ${pt.category}` : ''}
                  </p>
                  {pt.note && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{pt.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoveredPage() {
  const { viewKey } = useAuthStore();
  const router = useRouter();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewKey) { router.replace('/'); return; }
    fetch('/api/routes', { headers: { Authorization: `Bearer ${viewKey}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SavedRoute[]) => {
        const subRoutes = data.filter((r) => !r.type || r.type === 'sub');
        setRoutes(subRoutes);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [viewKey, router]);

  const selectedRoute = routes.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm z-10 flex-shrink-0">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-bold text-foreground">All Covered Areas</h1>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {loading ? 'Loading…' : `${routes.length} sub-routes`}
        </span>
      </div>

      {/* Map + detail panel */}
      <div className="flex-1 relative overflow-hidden">
        {!loading && (
          <CoveredMapView
            routes={routes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDeselect={() => setSelectedId(null)}
          />
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading routes…</p>
          </div>
        )}

        {selectedRoute && (
          <DetailPanel route={selectedRoute} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
