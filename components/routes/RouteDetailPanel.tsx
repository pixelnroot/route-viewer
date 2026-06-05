'use client';

import { useEffect, useState } from 'react';
import { X, Layers, PlayCircle, ChevronLeft, ChevronRight, Play, Pause, ChevronDown, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { cn } from '@/lib/utils';
import type { PointType, RoutePoint, SavedRoute } from '@/types/routes';

const POINT_TYPE_COLORS: Record<PointType, string> = {
  start: 'bg-green-500',
  waypoint: 'bg-blue-500',
  poi: 'bg-yellow-500',
  destination: 'bg-red-500',
};

function ptDistM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function isBoundaryDuplicate(a: RoutePoint, b: RoutePoint): boolean {
  return a.label.toLowerCase() === b.label.toLowerCase() || ptDistM(a, b) < 20;
}

interface PointWithSource extends RoutePoint {
  _subRouteName: string;
  _subRouteColor: string;
}

export default function RouteDetailPanel() {
  const {
    selectedRouteId, savedRoutes, categories,
    selectRoute, showCheckposts, setShowCheckposts,
  } = useRouteBuilderStore();

  const [presentationActive, setPresentationActive] = useState(false);
  const [presentationIdx, setPresentationIdx] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'by-subroute'>('overview');
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null);

  const route = savedRoutes.find((r) => r.id === selectedRouteId);

  const subRoutes: SavedRoute[] = (route?.type === 'main')
    ? (route.sub_route_ids ?? [])
        .map((id) => savedRoutes.find((r) => r.id === id))
        .filter((r): r is SavedRoute => !!r)
    : [];

  const mainDirectPoints: PointWithSource[] = (route?.type === 'main' && (route.points ?? []).length > 0)
    ? [...(route.points ?? [])].sort((a, b) => a.order - b.order).map((p) => ({
        ...p, _subRouteName: 'Direct', _subRouteColor: route!.color,
      }))
    : [];

  // Group direct points by position_after so they interleave with sub-routes
  const directByPos = new Map<string, PointWithSource[]>();
  mainDirectPoints.forEach((pt) => {
    const key = pt.position_after ?? '__end__';
    if (!directByPos.has(key)) directByPos.set(key, []);
    directByPos.get(key)!.push(pt);
  });

  // Pre-sort each sub-route's points, deduplicating at boundaries between sub-routes
  const sortedSubPoints = new Map<string, RoutePoint[]>();
  subRoutes.forEach((sub, idx) => {
    const pts = [...sub.points].sort((a, b) => a.order - b.order);
    if (idx > 0) {
      const prevPts = sortedSubPoints.get(subRoutes[idx - 1].id) ?? [];
      const prevLast = prevPts[prevPts.length - 1];
      if (prevLast && pts[0] && isBoundaryDuplicate(prevLast, pts[0])) {
        sortedSubPoints.set(sub.id, pts.slice(1));
        return;
      }
    }
    sortedSubPoints.set(sub.id, pts);
  });

  const mainPointsWithSource: PointWithSource[] = [
    ...(directByPos.get('start') ?? []),
    ...subRoutes.flatMap((sub) => [
      ...(sortedSubPoints.get(sub.id) ?? [])
        .map((p) => ({ ...p, _subRouteName: sub.name, _subRouteColor: sub.color })),
      ...(directByPos.get(sub.id) ?? []),
    ]),
    ...(directByPos.get('__end__') ?? []),
  ];

  const mainVisiblePoints = mainPointsWithSource;

  useEffect(() => {
    setPresentationActive(false);
    setPresentationIdx(0);
    setAutoPlay(false);
    setDetailTab('overview');
    setExpandedSubId(null);
  }, [selectedRouteId]);

  useEffect(() => {
    if (!autoPlay || !presentationActive || mainVisiblePoints.length === 0) return;
    if (presentationIdx >= mainVisiblePoints.length - 1) {
      setAutoPlay(false);
      return;
    }
    const timer = setTimeout(() => {
      const next = presentationIdx + 1;
      setPresentationIdx(next);
      const pt = mainVisiblePoints[next];
      useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng);
    }, 3000);
    return () => clearTimeout(timer);
  }, [autoPlay, presentationActive, presentationIdx, mainVisiblePoints.length]);

  const goToPoint = (idx: number) => {
    const clamped = Math.max(0, Math.min(mainVisiblePoints.length - 1, idx));
    setPresentationIdx(clamped);
    const pt = mainVisiblePoints[clamped];
    if (pt) useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng);
  };

  if (!route) return null;

  const isMainRoute = route.type === 'main';
  const category = route.category_id ? categories.find((c) => c.id === route.category_id) : null;

  // ── Main route panel ─────────────────────────────────────────────────────────
  if (isMainRoute) {
    const currentPt = presentationActive ? mainVisiblePoints[presentationIdx] : null;

    return (
      <div className="flex flex-col h-full bg-background border-l border-border w-96">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-2 min-w-0 flex-1 mr-2">
            <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: route.color }} />
            <div className="min-w-0">
              <span className="font-bold text-base text-foreground leading-snug">{route.name}</span>
              <p className="text-xs text-primary font-medium flex items-center gap-1 mt-0.5">
                <Layers className="w-3 h-3" />
                Main Route · {subRoutes.length} sub-routes · {mainVisiblePoints.length} points
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {presentationActive && (
              <button
                onClick={() => { setPresentationActive(false); setAutoPlay(false); }}
                className="text-xs px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors"
              >
                Exit
              </button>
            )}
            <button onClick={() => selectRoute(null)} className="text-foreground/60 hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs — only show when not in presentation */}
        {!presentationActive && (
          <div className="flex border-b border-border flex-shrink-0">
            <button
              onClick={() => setDetailTab('overview')}
              className={cn(
                'flex-1 text-sm font-semibold min-h-[48px] transition-colors',
                detailTab === 'overview'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Overview
            </button>
            <button
              onClick={() => setDetailTab('by-subroute')}
              className={cn(
                'flex-1 text-sm font-semibold min-h-[48px] transition-colors',
                detailTab === 'by-subroute'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              By Route ({subRoutes.length})
            </button>
          </div>
        )}

        {/* Presentation mode */}
        {presentationActive && currentPt ? (
          <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
              <span className="text-xs text-muted-foreground">
                Step {presentationIdx + 1} of {mainVisiblePoints.length}
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: currentPt._subRouteColor + '25',
                  color: currentPt._subRouteColor,
                }}
              >
                {currentPt._subRouteName}
              </span>
            </div>

            {/* Point content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 pr-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full ${POINT_TYPE_COLORS[currentPt.type]} flex items-center justify-center text-white text-base font-bold flex-shrink-0`}
                  >
                    {currentPt.icon ?? (presentationIdx + 1)}
                  </div>
                  <div>
                    <p className="font-bold text-xl text-foreground leading-tight">{currentPt.label}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{currentPt.type}</p>
                  </div>
                </div>

                {currentPt.category && (
                  <p className="text-xs text-foreground/70 capitalize">{currentPt.category}</p>
                )}

                <p className="text-xs text-foreground/60 font-mono">
                  {currentPt.lat.toFixed(5)}, {currentPt.lng.toFixed(5)}
                </p>

                {currentPt.note && (
                  <p className="text-sm text-foreground italic leading-snug">{currentPt.note}</p>
                )}

                {currentPt.imageUrl && (
                  <img
                    src={currentPt.imageUrl}
                    alt={currentPt.label}
                    className="w-full rounded-md object-cover max-h-52"
                  />
                )}
              </div>
            </ScrollArea>

            {/* Progress dots */}
            {mainVisiblePoints.length <= 20 && (
              <div className="flex justify-center gap-1 py-3 flex-wrap flex-shrink-0">
                {mainVisiblePoints.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToPoint(i)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors',
                      i === presentationIdx
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
                    )}
                  />
                ))}
              </div>
            )}

            {/* Nav controls */}
            <div className="flex items-center gap-2 pt-3 border-t border-border flex-shrink-0">
              <button
                onClick={() => goToPoint(presentationIdx - 1)}
                disabled={presentationIdx === 0}
                className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-40 touch-manipulation"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              <button
                onClick={() => setAutoPlay(!autoPlay)}
                title={autoPlay ? 'Pause' : 'Auto-advance every 3s'}
                className={cn(
                  'h-12 w-12 flex items-center justify-center rounded-xl border transition-colors flex-shrink-0 touch-manipulation',
                  autoPlay
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                )}
              >
                {autoPlay ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              <button
                onClick={() => goToPoint(presentationIdx + 1)}
                disabled={presentationIdx === mainVisiblePoints.length - 1}
                className="flex-1 h-12 flex items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold hover:bg-accent transition-colors disabled:opacity-40 touch-manipulation"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : detailTab === 'by-subroute' ? (
          /* By Sub-route tab */
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="p-4 space-y-2">
              {/* Direct waypoints before all sub-routes */}
              {(directByPos.get('start') ?? []).filter(p => showCheckposts || p.type !== 'poi').length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: route.color }} />
                    <span className="text-sm font-medium flex-1">Before sub-routes</span>
                    <span className="text-xs text-muted-foreground">{(directByPos.get('start') ?? []).length} pts</span>
                  </div>
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                    {(directByPos.get('start') ?? []).filter(p => showCheckposts || p.type !== 'poi').map((pt, i) => (
                      <button key={pt.id} onClick={() => useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng)}
                        className="w-full flex items-start gap-2 text-left hover:bg-accent/40 rounded-lg px-2 py-2 min-h-[48px] transition-colors touch-manipulation">
                        <div className={`w-5 h-5 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>{i + 1}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate" title={pt.label}>{pt.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {subRoutes.map((sub) => {
                const subPts = (sortedSubPoints.get(sub.id) ?? [])
                  .filter((p) => showCheckposts || p.type !== 'poi');
                const afterPts = (directByPos.get(sub.id) ?? []).filter(p => showCheckposts || p.type !== 'poi');
                const isOpen = expandedSubId === sub.id;
                return (
                  <div key={sub.id} className="border border-border rounded-md overflow-hidden">
                    <button
                      onClick={() => setExpandedSubId(isOpen ? null : sub.id)}
                      className="w-full flex items-center gap-2 px-3 py-3.5 min-h-[52px] bg-card hover:bg-accent text-left transition-colors touch-manipulation"
                    >
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                      <span className="text-sm font-medium flex-1 truncate" title={sub.name}>{sub.name}</span>
                      <span className="text-xs text-muted-foreground mr-1">{subPts.length} pts</span>
                      <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0', isOpen && 'rotate-180')} />
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border">
                        {subPts.length > 0 && (
                          <button
                            onClick={() => { const pt = subPts[0]; if (pt) useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng); }}
                            className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-1 mb-2 min-h-[44px] touch-manipulation"
                          >
                            <MapPin className="w-3 h-3" /> Navigate to start
                          </button>
                        )}
                        {subPts.map((pt, i) => (
                          <button key={pt.id} onClick={() => useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng)}
                            className="w-full flex items-start gap-2 text-left hover:bg-accent/40 rounded-lg px-2 py-2 min-h-[48px] transition-colors touch-manipulation">
                            <div className={`w-5 h-5 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>{i + 1}</div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate" title={pt.label}>{pt.label}</p>
                              <p className="text-xs text-muted-foreground font-mono">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                            </div>
                          </button>
                        ))}
                        {afterPts.length > 0 && (
                          <>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide pt-1">Direct waypoints after this sub-route</p>
                            {afterPts.map((pt, i) => (
                              <button key={pt.id} onClick={() => useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng)}
                                className="w-full flex items-start gap-2 text-left hover:bg-accent/40 rounded-lg px-2 py-2 min-h-[48px] transition-colors touch-manipulation">
                                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate" title={pt.label}>{pt.label}</p>
                                  <p className="text-xs text-muted-foreground font-mono">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                                </div>
                              </button>
                            ))}
                          </>
                        )}
                        {subPts.length === 0 && afterPts.length === 0 && (
                          <p className="text-xs text-muted-foreground py-2 text-center">No points to display.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Direct waypoints at the end */}
              {(directByPos.get('__end__') ?? []).filter(p => showCheckposts || p.type !== 'poi').length > 0 && (
                <div className="border border-border rounded-md overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: route.color }} />
                    <span className="text-sm font-medium flex-1">After all sub-routes</span>
                    <span className="text-xs text-muted-foreground">{(directByPos.get('__end__') ?? []).length} pts</span>
                  </div>
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border">
                    {(directByPos.get('__end__') ?? []).filter(p => showCheckposts || p.type !== 'poi').map((pt, i) => (
                      <button key={pt.id} onClick={() => useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng)}
                        className="w-full flex items-start gap-2 text-left hover:bg-accent/40 rounded-lg px-2 py-2 min-h-[48px] transition-colors touch-manipulation">
                        <div className={`w-5 h-5 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>{i + 1}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate" title={pt.label}>{pt.label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        ) : (
          /* Overview tab */
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="p-4 space-y-4">
              {category && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" style={{ borderColor: category.color, color: category.color }}>
                    {category.name}
                  </Badge>
                </div>
              )}
              {route.description && (
                <p className="text-sm text-foreground leading-relaxed">{route.description}</p>
              )}

              {mainVisiblePoints.length > 0 && (
                <button
                  onClick={() => {
                    setPresentationIdx(0);
                    setPresentationActive(true);
                    const pt = mainVisiblePoints[0];
                    if (pt) useRouteBuilderStore.getState().flyTo(pt.lat, pt.lng);
                  }}
                  className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary/10 text-primary border border-primary/20 text-base font-semibold hover:bg-primary/20 transition-colors touch-manipulation"
                >
                  <PlayCircle className="w-4 h-4" />
                  Start Presentation
                </button>
              )}

              <Separator />

              <section>
                <p className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">
                  Route Points ({mainPointsWithSource.length})
                </p>
                <div className="space-y-5">
                  {/* Direct waypoints before all sub-routes */}
                  {(directByPos.get('start') ?? []).filter(p => showCheckposts || p.type !== 'poi').length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: route.color }} />
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Before sub-routes</p>
                      </div>
                      <div className="space-y-3 pl-3 border-l-2" style={{ borderColor: route.color + '50' }}>
                        {(directByPos.get('start') ?? []).filter(p => showCheckposts || p.type !== 'poi').map((pt, i) => (
                          <div key={pt.id} className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{pt.icon ?? (i + 1)}</div>
                            <div className="pb-1 min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">{pt.label}</p>
                              <p className="text-xs text-foreground/60 font-mono mt-0.5">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                              {pt.note && <p className="text-sm text-foreground italic mt-1 leading-snug">{pt.note}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {subRoutes.map((sub) => {
                    const subPoints = (sortedSubPoints.get(sub.id) ?? [])
                      .filter((p) => showCheckposts || p.type !== 'poi');
                    const afterPoints = (directByPos.get(sub.id) ?? []).filter(p => showCheckposts || p.type !== 'poi');
                    if (subPoints.length === 0 && afterPoints.length === 0) return null;
                    return (
                      <div key={sub.id}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sub.color }} />
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            {sub.name}
                          </p>
                        </div>
                        <div className="space-y-3 pl-3 border-l-2" style={{ borderColor: sub.color + '50' }}>
                          {subPoints.map((pt, i) => (
                            <div key={pt.id} className="flex items-start gap-3">
                              <div className="flex flex-col items-center flex-shrink-0">
                                <div className={`w-6 h-6 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold`}>
                                  {pt.icon ?? (i + 1)}
                                </div>
                                {i < subPoints.length - 1 && <div className="w-px h-5 bg-border mt-1" />}
                              </div>
                              <div className="pb-1 min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">{pt.label}</p>
                                {pt.category && <p className="text-xs text-foreground/70 capitalize mt-0.5">{pt.category}</p>}
                                <p className="text-xs text-foreground/60 font-mono mt-0.5">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                                {pt.note && <p className="text-sm text-foreground italic mt-1 leading-snug">{pt.note}</p>}
                                {pt.imageUrl && <img src={pt.imageUrl} alt={pt.label} className="mt-2 w-full rounded-md object-cover max-h-40" />}
                              </div>
                            </div>
                          ))}
                          {/* Direct waypoints placed after this sub-route */}
                          {afterPoints.map((pt, i) => (
                            <div key={pt.id} className="flex items-start gap-3">
                              <div className={`w-6 h-6 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                <MapPin className="w-3 h-3" />
                              </div>
                              <div className="pb-1 min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground">{pt.label}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Direct waypoint</p>
                                <p className="text-xs text-foreground/60 font-mono mt-0.5">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                                {pt.note && <p className="text-sm text-foreground italic mt-1 leading-snug">{pt.note}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Direct waypoints at the end */}
                  {(directByPos.get('__end__') ?? []).filter(p => showCheckposts || p.type !== 'poi').length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: route.color }} />
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">After all sub-routes</p>
                      </div>
                      <div className="space-y-3 pl-3 border-l-2" style={{ borderColor: route.color + '50' }}>
                        {(directByPos.get('__end__') ?? []).filter(p => showCheckposts || p.type !== 'poi').map((pt, i) => (
                          <div key={pt.id} className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full ${POINT_TYPE_COLORS[pt.type]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{pt.icon ?? (i + 1)}</div>
                            <div className="pb-1 min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">{pt.label}</p>
                              <p className="text-xs text-foreground/60 font-mono mt-0.5">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                              {pt.note && <p className="text-sm text-foreground italic mt-1 leading-snug">{pt.note}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <Separator />

              <section className="space-y-1 text-xs text-foreground/60">
                <p>Created: {new Date(route.created_at).toLocaleString()}</p>
                <p>Updated: {new Date(route.updated_at).toLocaleString()}</p>
              </section>
            </div>
          </ScrollArea>
        )}
      </div>
    );
  }

  // ── Sub-route panel (admin/edit only) ─────────────────────────────────────────
  const allSorted = [...route.points].sort((a, b) => a.order - b.order);
  const subHasCheckposts = allSorted.some(p => p.type === 'poi');
  const sorted = showCheckposts ? allSorted : allSorted.filter(p => p.type !== 'poi');

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
      {subHasCheckposts && (
        <div className="px-4 py-2.5 border-b border-border flex-shrink-0 flex gap-2">
          <button
            onClick={() => setShowCheckposts(true)}
            className={cn(
              'text-sm px-4 py-2 min-h-[44px] rounded-full border font-medium transition-colors touch-manipulation',
              showCheckposts
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            With Checkpost
          </button>
          <button
            onClick={() => setShowCheckposts(false)}
            className={cn(
              'text-sm px-4 py-2 min-h-[44px] rounded-full border font-medium transition-colors touch-manipulation',
              !showCheckposts
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            Without
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
              Route Points ({sorted.length}{!showCheckposts && subHasCheckposts ? ` of ${allSorted.length}` : ''})
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
