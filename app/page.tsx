'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Lock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import RouteDetailPanel from '@/components/routes/RouteDetailPanel';
import { cn } from '@/lib/utils';

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
          <Button
            type="submit"
            className="w-full h-11 text-base"
            disabled={loading}
          >
            {loading ? 'Verifying…' : 'Access Map'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ── Category filter overlay ───────────────────────────────────────────────────

function CategoryFilter() {
  const { categories, categoryFilter, setCategoryFilter } = useRouteBuilderStore();
  if (categories.length === 0) return null;

  return (
    <div className="absolute top-4 left-4 z-10 bg-background/90 backdrop-blur-sm rounded-xl border shadow-md px-3 py-2 flex flex-wrap gap-1.5 max-w-xs">
      <button
        onClick={() => setCategoryFilter(null)}
        className={cn(
          'text-xs px-3 py-1 rounded-full border font-medium transition-colors',
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
            'text-xs px-3 py-1 rounded-full border font-medium transition-colors',
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
    <div className="relative h-full w-full overflow-hidden">
      <DataLoader />
      <MapView />
      <CategoryFilter />
      {selectedRouteId && (
        <div className="absolute right-0 top-0 h-full z-10 shadow-2xl">
          <RouteDetailPanel />
        </div>
      )}
    </div>
  );
}
