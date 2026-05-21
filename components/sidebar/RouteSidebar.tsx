'use client';

import { useEffect } from 'react';
import { Plus, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { SavedRoute, RiskLevel, RouteStatus } from '@/types/routes';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

const RISK_COLORS: Record<RiskLevel, string> = {
  low: 'text-green-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};

function RouteCard({
  route,
  selected,
  onClick,
}: {
  route: SavedRoute;
  selected: boolean;
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
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
          style={{ backgroundColor: route.color }}
        />
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

export default function RouteSidebar() {
  const { savedRoutes, selectedRouteId, mode, setSavedRoutes, selectRoute, setMode } =
    useRouteBuilderStore();
  const { viewKey, editKey, setEditKey, clearKeys } = useAuthStore();
  
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [editKeyInput, setEditKeyInput] = useState('');

  // Load routes from API on mount and when viewKey changes
  useEffect(() => {
    if (!viewKey) return;
    
    fetch('/api/routes', {
      headers: { Authorization: `Bearer ${viewKey}` }
    })
      .then((r) => {
        if (r.status === 401) {
          clearKeys(); // Invalid key, clear it
          return [];
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setSavedRoutes(data);
      })
      .catch(() => {});
  }, [setSavedRoutes, viewKey, clearKeys]);

  const handleCreateRoute = () => {
    if (!editKey) {
      setShowEditPrompt(true);
      return;
    }
    selectRoute(null);
    setMode('create');
  };

  const submitEditKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (editKeyInput.trim()) {
      setEditKey(editKeyInput.trim());
      setShowEditPrompt(false);
      selectRoute(null);
      setMode('create');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-r border-border w-64">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-bold text-sm">Field Routes</h1>
          <MapPin className="w-4 h-4 text-primary" />
        </div>
        <p className="text-xs text-muted-foreground">{savedRoutes.length} saved routes</p>
      </div>

      {/* Create button */}
      <div className="px-3 py-2 flex-shrink-0 space-y-2">
        <Button
          onClick={handleCreateRoute}
          size="sm"
          className="w-full h-8 text-xs"
          variant={mode === 'create' ? 'secondary' : 'default'}
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
          {savedRoutes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No routes saved yet.
              <br />
              Create your first route.
            </p>
          ) : (
            savedRoutes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                selected={selectedRouteId === route.id}
                onClick={() => selectRoute(route.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
