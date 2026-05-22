'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { cn } from '@/lib/utils';
import type { PointType } from '@/types/routes';

const POINT_TYPE_COLORS: Record<PointType, string> = {
  start: 'bg-green-500',
  waypoint: 'bg-blue-500',
  poi: 'bg-yellow-500',
  destination: 'bg-red-500',
};

export default function RouteDetailPanel() {
  const { selectedRouteId, savedRoutes, categories, selectRoute } = useRouteBuilderStore();
  const [showCheckpost, setShowCheckpost] = useState(true);

  const route = savedRoutes.find((r) => r.id === selectedRouteId);
  if (!route) return null;

  const allSorted = [...route.points].sort((a, b) => a.order - b.order);
  const hasCheckposts = allSorted.some(p => p.type === 'poi');
  const sorted = showCheckpost ? allSorted : allSorted.filter(p => p.type !== 'poi');
  const category = route.category_id ? categories.find((c) => c.id === route.category_id) : null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-96">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-start gap-2 min-w-0 flex-1 mr-2">
          <div
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: route.color }}
          />
          <span className="font-bold text-base text-foreground leading-snug">{route.name}</span>
        </div>
        <button
          onClick={() => selectRoute(null)}
          className="text-foreground/60 hover:text-foreground flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Checkpost filter */}
      {hasCheckposts && (
        <div className="px-4 py-2 border-b border-border flex-shrink-0 flex gap-1.5">
          <button
            onClick={() => setShowCheckpost(true)}
            className={cn(
              'text-xs px-3 py-1 rounded-full border font-medium transition-colors',
              showCheckpost
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            With Checkpost
          </button>
          <button
            onClick={() => setShowCheckpost(false)}
            className={cn(
              'text-xs px-3 py-1 rounded-full border font-medium transition-colors',
              !showCheckpost
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            Without Checkpost
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-4">
          {/* Badges */}
          {category && (
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                className="font-semibold text-sm"
                style={{ borderColor: category.color, color: category.color }}
              >
                {category.name}
              </Badge>
            </div>
          )}

          {route.description && (
            <p className="text-sm text-foreground leading-relaxed">{route.description}</p>
          )}

          <Separator />

          {/* Points */}
          <section>
            <p className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
              Route Points ({sorted.length}{!showCheckpost && hasCheckposts ? ` of ${allSorted.length}` : ''})
            </p>
            <div className="space-y-4">
              {sorted.map((pt, i) => (
                <div key={pt.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-6 h-6 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold`}
                    >
                      {pt.icon ?? (i + 1)}
                    </div>
                    {i < sorted.length - 1 && (
                      <div className="w-px h-5 bg-border mt-1" />
                    )}
                  </div>
                  <div className="pb-1 min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{pt.label}</p>
                    {pt.category && (
                      <p className="text-xs text-foreground/70 capitalize mt-0.5">{pt.category}</p>
                    )}
                    <p className="text-xs text-foreground/60 font-mono mt-0.5">
                      {pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}
                    </p>
                    {pt.note && (
                      <p className="text-sm text-foreground italic mt-1 leading-snug">
                        {pt.note}
                      </p>
                    )}
                    {pt.imageUrl && (
                      <img
                        src={pt.imageUrl}
                        alt={pt.label}
                        className="mt-2 w-full rounded-md object-cover max-h-40"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          <section className="space-y-1 text-xs text-foreground/60">
            <p>Created: {new Date(route.created_at).toLocaleString()}</p>
            <p>Updated: {new Date(route.updated_at).toLocaleString()}</p>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
