'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Lock, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import RouteDetailPanel from '@/components/routes/RouteDetailPanel';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });
const RouteFinderPanel = dynamic(() => import('@/components/route-finder/RouteFinderPanel'), { ssr: false });

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

  if (!viewKey) return <AuthGate />;

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      <DataLoader />
      <MapView />
      <RouteFinderPanel />

      {/* Desktop: detail panel on right when a sub-route is selected */}
      {selectedRouteId && (
        <div className="hidden md:flex h-full flex-shrink-0 shadow-2xl z-20 absolute right-0 top-0 bottom-0">
          <RouteDetailPanel />
        </div>
      )}

      {/* Mobile: back button */}
      {selectedRouteId && (
        <button
          onClick={() => selectRoute(null)}
          className="md:hidden absolute top-3 right-3 z-20 bg-background/95 backdrop-blur-sm border border-border rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 text-sm font-semibold min-h-[44px] active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* Mobile: detail bottom sheet */}
      {selectedRouteId && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/20" onClick={() => selectRoute(null)} />
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
