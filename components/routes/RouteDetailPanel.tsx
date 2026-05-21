'use client';

import { X, MapPin, Navigation, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { PointType, RiskLevel, RouteStatus } from '@/types/routes';
import { useState } from 'react';

const RISK_VARIANTS: Record<RiskLevel, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'secondary',
  medium: 'outline',
  high: 'destructive',
  critical: 'destructive',
};

const STATUS_VARIANTS: Record<RouteStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  active: 'default',
  archived: 'secondary',
};

const POINT_TYPE_COLORS: Record<PointType, string> = {
  start: 'bg-green-500',
  waypoint: 'bg-blue-500',
  poi: 'bg-yellow-500',
  destination: 'bg-red-500',
};

export default function RouteDetailPanel() {
  const { selectedRouteId, savedRoutes, selectRoute, removeSavedRoute } = useRouteBuilderStore();
  const { editKey, setEditKey } = useAuthStore();
  
  const [showEditPrompt, setShowEditPrompt] = useState(false);
  const [editKeyInput, setEditKeyInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const route = savedRoutes.find((r) => r.id === selectedRouteId);
  if (!route) return null;

  const sorted = [...route.points].sort((a, b) => a.order - b.order);

  const handleDeleteClick = () => {
    if (!editKey) {
      setShowEditPrompt(true);
      return;
    }
    setShowConfirm(true);
  };

  const submitEditKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (editKeyInput.trim()) {
      setEditKey(editKeyInput.trim());
      setShowEditPrompt(false);
      setShowConfirm(true);
    }
  };

  const confirmDelete = async () => {
    if (!editKey || !route.id) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${editKey}`
        },
      });
      if (res.status === 401) {
        setEditKey('');
        throw new Error('Invalid Edit Admin Key');
      }
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      
      removeSavedRoute(route.id);
      selectRoute(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: route.color }}
          />
          <span className="font-semibold text-sm truncate">{route.name}</span>
        </div>
        <button
          onClick={() => selectRoute(null)}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={STATUS_VARIANTS[route.status]}>{route.status}</Badge>
            <Badge variant={RISK_VARIANTS[route.risk_level]}>
              {route.risk_level} risk
            </Badge>
            <Badge variant="outline">{route.travel_mode}</Badge>
          </div>

          {route.description && (
            <p className="text-sm text-muted-foreground">{route.description}</p>
          )}

          <Separator />

          {/* Points */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Route Points ({sorted.length})
            </p>
            <div className="space-y-2">
              {sorted.map((pt, i) => (
                <div key={pt.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-5 h-5 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}
                    >
                      {i + 1}
                    </div>
                    {i < sorted.length - 1 && (
                      <div className="w-px h-4 bg-border mt-0.5" />
                    )}
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className="text-xs font-medium truncate">{pt.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                    </p>
                    {pt.note && (
                      <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">
                        {pt.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Meta */}
          <section className="space-y-1 text-xs text-muted-foreground">
            <p>Created: {new Date(route.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(route.updated_at).toLocaleString()}</p>
          </section>
          {/* Delete Action */}
          <Separator />
          <section className="space-y-3 pt-2 pb-4">
            {deleteError && (
              <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {deleteError}
              </div>
            )}

            {showConfirm ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 space-y-3">
                <p className="text-xs text-destructive font-medium">Are you sure you want to delete this route?</p>
                <div className="flex gap-2">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="flex-1 h-8 text-xs"
                    onClick={confirmDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    Yes, Delete
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 h-8 text-xs"
                    onClick={() => setShowConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : showEditPrompt ? (
              <form onSubmit={submitEditKey} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Admin Key required to delete.</p>
                <div className="flex gap-2">
                  <Input 
                    type="password"
                    placeholder="Edit Key" 
                    className="h-8 text-xs flex-1"
                    value={editKeyInput}
                    onChange={(e) => setEditKeyInput(e.target.value)}
                    autoFocus
                  />
                  <Button type="submit" size="sm" className="h-8">OK</Button>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowEditPrompt(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button
                variant="destructive"
                className="w-full h-8 text-xs"
                onClick={handleDeleteClick}
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
