'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import type { PointType, RiskLevel, RouteStatus } from '@/types/routes';

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
  const { selectedRouteId, savedRoutes, categories, selectRoute } = useRouteBuilderStore();

  const route = savedRoutes.find((r) => r.id === selectedRouteId);
  if (!route) return null;

  const sorted = [...route.points].sort((a, b) => a.order - b.order);
  const category = route.category_id ? categories.find((c) => c.id === route.category_id) : null;

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
          className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={STATUS_VARIANTS[route.status]}>{route.status}</Badge>
            <Badge variant={RISK_VARIANTS[route.risk_level]}>{route.risk_level} risk</Badge>
            <Badge variant="outline">{route.travel_mode}</Badge>
            {category && (
              <Badge
                variant="outline"
                className="font-medium"
                style={{ borderColor: category.color, color: category.color }}
              >
                {category.name}
              </Badge>
            )}
          </div>

          {route.description && (
            <p className="text-sm text-muted-foreground">{route.description}</p>
          )}

          <Separator />

          {/* Points */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Route Points ({sorted.length})
            </p>
            <div className="space-y-3">
              {sorted.map((pt, i) => (
                <div key={pt.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-5 h-5 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-[9px] font-bold`}
                    >
                      {pt.icon ?? (i + 1)}
                    </div>
                    {i < sorted.length - 1 && (
                      <div className="w-px h-4 bg-border mt-0.5" />
                    )}
                  </div>
                  <div className="pb-1 min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{pt.label}</p>
                    {pt.category && (
                      <p className="text-[10px] text-muted-foreground capitalize">{pt.category}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                    </p>
                    {pt.note && (
                      <p className="text-[10px] text-muted-foreground italic mt-0.5">
                        {pt.note}
                      </p>
                    )}
                    {pt.imageUrl && (
                      <img
                        src={pt.imageUrl}
                        alt={pt.label}
                        className="mt-1.5 w-full rounded-md object-cover max-h-32"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section className="space-y-1 text-xs text-muted-foreground">
            <p>Created: {new Date(route.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(route.updated_at).toLocaleString()}</p>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
