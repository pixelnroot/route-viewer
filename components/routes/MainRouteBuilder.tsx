'use client';

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  X, Layers, Save, Loader2, AlertCircle, Plus, Minus, GripVertical, MapPin, Trash2, Pencil, Scissors, RotateCcw,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import RouteColorPicker from './RouteColorPicker';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { PointType, RoutePoint, SavedRoute } from '@/types/routes';
import { fetchRouteGoogle } from '@/lib/routing/google-directions';

function SortableSubRoute({
  id, name, color, isPartial, isTrimming, onRemove, onTrim, onResetSegment, onCancelTrim,
}: {
  id: string; name: string; color: string;
  isPartial: boolean; isTrimming: boolean;
  onRemove: () => void; onTrim: () => void; onResetSegment: () => void; onCancelTrim: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex flex-col gap-1.5 bg-card border border-border rounded-lg p-3 min-h-[52px]"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none min-w-[44px] min-h-[44px] flex items-center justify-center -ml-1"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium flex-1 break-words line-clamp-3">{name}</span>
        {isPartial && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium flex-shrink-0">
            Partial
          </span>
        )}
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-1"
        >
          <Minus className="w-4 h-4" />
        </button>
      </div>
      {isTrimming ? (
        <div className="flex items-center gap-2 pl-1">
          <p className="text-[10px] text-muted-foreground flex-1">Click 2 points on its line on the map…</p>
          <button onClick={onCancelTrim} className="text-xs text-muted-foreground hover:underline flex-shrink-0">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 pl-1">
          <button onClick={onTrim} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <Scissors className="w-3 h-3" /> Trim on map
          </button>
          {isPartial && (
            <button onClick={onResetSegment} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
              <RotateCcw className="w-3 h-3" /> Reset to full
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MainRouteBuilder() {
  const {
    savedRoutes, mainRouteSubRouteIds, mainRouteMeta, editingRouteId,
    addSubRouteToMain, removeSubRouteFromMain, reorderMainSubRoutes,
    setMainRouteMeta, setMode, addSavedRoute, updateSavedRoute,
    selectRoute, resetMainBuilder, resetBuilder, clickedCoord,
    mainRouteSegments, trimTarget, setTrimTarget, clearMainRouteSegment,
  } = useRouteBuilderStore();
  const { editKey, setEditKey } = useAuthStore();

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userEditedName, setUserEditedName] = useState(false);

  const [manualPoints, setManualPoints] = useState<RoutePoint[]>([]);
  const [showAddPoint, setShowAddPoint] = useState(false);
  const [editingPtId, setEditingPtId] = useState<string | null>(null);
  const [newPtLabel, setNewPtLabel] = useState('');
  const [newPtType, setNewPtType] = useState<PointType>('waypoint');
  const [newPtLat, setNewPtLat] = useState('');
  const [newPtLng, setNewPtLng] = useState('');
  const [newPtNote, setNewPtNote] = useState('');
  const [newPtPosition, setNewPtPosition] = useState('');

  useEffect(() => {
    if (editingRouteId) {
      const existing = savedRoutes.find((r) => r.id === editingRouteId);
      setManualPoints(existing?.points ?? []);
      setUserEditedName(true);
    } else {
      setManualPoints([]);
      setUserEditedName(false);
    }
  }, [editingRouteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addManualPoint = () => {
    const lat = parseFloat(newPtLat);
    const lng = parseFloat(newPtLng);
    if (!newPtLabel.trim() || isNaN(lat) || isNaN(lng)) return;
    if (editingPtId) {
      setManualPoints((prev) => prev.map((p) => p.id === editingPtId ? {
        ...p,
        label: newPtLabel.trim(),
        type: newPtType,
        lat,
        lng,
        note: newPtNote.trim() || undefined,
        position_after: newPtPosition || undefined,
      } : p));
    } else {
      const pt: RoutePoint = {
        id: uuidv4(),
        label: newPtLabel.trim(),
        type: newPtType,
        lat,
        lng,
        note: newPtNote.trim() || undefined,
        order: manualPoints.length,
        position_after: newPtPosition || undefined,
      };
      setManualPoints((prev) => [...prev, pt]);
    }
    setEditingPtId(null);
    setNewPtLabel('');
    setNewPtType('waypoint');
    setNewPtLat('');
    setNewPtLng('');
    setNewPtNote('');
    setNewPtPosition('');
    setShowAddPoint(false);
  };

  const startEditPoint = (pt: RoutePoint) => {
    setEditingPtId(pt.id);
    setNewPtLabel(pt.label);
    setNewPtType(pt.type);
    setNewPtLat(String(pt.lat));
    setNewPtLng(String(pt.lng));
    setNewPtNote(pt.note ?? '');
    setNewPtPosition(pt.position_after ?? '');
    setShowAddPoint(true);
  };

  const cancelPointForm = () => {
    setEditingPtId(null);
    setNewPtLabel('');
    setNewPtType('waypoint');
    setNewPtLat('');
    setNewPtLng('');
    setNewPtNote('');
    setNewPtPosition('');
    setShowAddPoint(false);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const subRoutes = savedRoutes.filter((r) => r.type !== 'main');
  const selectedSubRoutes = mainRouteSubRouteIds
    .map((id) => subRoutes.find((r) => r.id === id))
    .filter(Boolean) as SavedRoute[];
  const availableSubRoutes = subRoutes.filter((r) => !mainRouteSubRouteIds.includes(r.id));

  useEffect(() => {
    if (userEditedName || editingRouteId) return;
    if (selectedSubRoutes.length === 0) return;
    const first = selectedSubRoutes[0].name;
    const last = selectedSubRoutes[selectedSubRoutes.length - 1].name;
    setMainRouteMeta({ name: first === last ? first : `${first} → ${last}` });
  }, [mainRouteSubRouteIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = mainRouteSubRouteIds.indexOf(active.id as string);
    const newIdx = mainRouteSubRouteIds.indexOf(over.id as string);
    reorderMainSubRoutes(arrayMove(mainRouteSubRouteIds, oldIdx, newIdx));
  };

  const canSave = mainRouteSubRouteIds.length >= 1;

  const handleSave = async () => {
    if (!canSave || !editKey) return;
    setIsSaving(true);
    setSaveError(null);
    const effectiveName = mainRouteMeta.name?.trim() || (() => {
      const first = selectedSubRoutes[0]?.name ?? 'Main Route';
      const last = selectedSubRoutes[selectedSubRoutes.length - 1]?.name ?? first;
      return first === last ? first : `${first} → ${last}`;
    })();
    try {
      const travelMode = mainRouteMeta.travel_mode ?? 'driving';

      const fetchSegment = async (
        from: { lat: number; lng: number },
        to: { lat: number; lng: number }
      ): Promise<[number, number][]> => {
        try {
          const r = await fetchRouteGoogle(
            [
              { id: 'f', label: 'From', type: 'start' as const, lat: from.lat, lng: from.lng, order: 0 },
              { id: 't', label: 'To', type: 'destination' as const, lat: to.lat, lng: to.lng, order: 1 },
            ],
            travelMode
          );
          return r.geometry.coordinates as [number, number][];
        } catch {
          return [[from.lng, from.lat], [to.lng, to.lat]];
        }
      };

      const segmentCoords = (r: SavedRoute): [number, number][] => {
        const all = (r.geometry?.coordinates ?? []) as [number, number][];
        const seg = mainRouteSegments[r.id];
        return seg ? all.slice(seg.startIdx, seg.endIdx + 1) : all;
      };

      let combinedGeometry: GeoJSON.LineString | null = null;

      if (manualPoints.length === 0) {
        const coords = selectedSubRoutes.flatMap(segmentCoords);
        combinedGeometry = coords.length > 0 ? { type: 'LineString', coordinates: coords } : null;
      } else {
        const directByPos = new globalThis.Map<string, RoutePoint[]>();
        for (const pt of manualPoints) {
          const key = pt.position_after ?? '__end__';
          if (!directByPos.has(key)) directByPos.set(key, []);
          directByPos.get(key)!.push(pt);
        }

        const allCoords: [number, number][] = [];
        const lastC = (): { lat: number; lng: number } | null => {
          if (!allCoords.length) return null;
          const c = allCoords[allCoords.length - 1];
          return { lat: c[1], lng: c[0] };
        };
        const appendRouted = async (to: { lat: number; lng: number }) => {
          const from = lastC();
          if (!from) { allCoords.push([to.lng, to.lat]); return; }
          const coords = await fetchSegment(from, to);
          allCoords.push(...coords.slice(1));
        };

        for (const pt of directByPos.get('start') ?? []) {
          await appendRouted({ lat: pt.lat, lng: pt.lng });
        }

        let lastWasWaypoint = (directByPos.get('start') ?? []).length > 0;

        for (let i = 0; i < selectedSubRoutes.length; i++) {
          const sub = selectedSubRoutes[i];
          const subCoords = segmentCoords(sub);
          if (!subCoords.length) { lastWasWaypoint = false; continue; }

          if (!allCoords.length) {
            allCoords.push(...subCoords);
          } else if (lastWasWaypoint) {
            const from = lastC()!;
            const subFirst = { lat: subCoords[0][1], lng: subCoords[0][0] };
            const bridge = await fetchSegment(from, subFirst);
            allCoords.push(...bridge.slice(1));
            allCoords.push(...subCoords.slice(1));
          } else {
            allCoords.push(...subCoords);
          }

          const afterPts = directByPos.get(sub.id) ?? [];
          for (const pt of afterPts) {
            await appendRouted({ lat: pt.lat, lng: pt.lng });
          }
          lastWasWaypoint = afterPts.length > 0;
        }

        for (const pt of directByPos.get('__end__') ?? []) {
          await appendRouted({ lat: pt.lat, lng: pt.lng });
        }

        combinedGeometry = allCoords.length > 0 ? { type: 'LineString', coordinates: allCoords } : null;
      }

      const sub_route_segments = Object.fromEntries(
        Object.entries(mainRouteSegments)
          .filter(([id]) => mainRouteSubRouteIds.includes(id))
          .map(([id, seg]) => [id, { start_idx: seg.startIdx, end_idx: seg.endIdx }])
      );

      const body = {
        type: 'main' as const,
        sub_route_ids: mainRouteSubRouteIds,
        sub_route_segments,
        name: effectiveName,
        description: mainRouteMeta.description ?? '',
        color: mainRouteMeta.color ?? '#3b82f6',
        status: mainRouteMeta.status ?? 'draft',
        risk_level: mainRouteMeta.risk_level ?? 'low',
        travel_mode: mainRouteMeta.travel_mode ?? 'driving',
        category_id: mainRouteMeta.category_id,
        has_checkpost: selectedSubRoutes.some(r => r.has_checkpost === true),
        points: manualPoints,
        geometry: combinedGeometry,
      };

      const isEdit = !!editingRouteId;
      const url = isEdit ? `/api/routes/${editingRouteId}` : '/api/routes';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { setEditKey(''); throw new Error('Invalid key.'); }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const saved = await res.json();

      if (isEdit) { updateSavedRoute(saved); selectRoute(saved.id); }
      else { addSavedRoute(saved); }
      resetMainBuilder();
      resetBuilder();
      setMode('view');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border w-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">
            {editingRouteId ? 'Edit Main Route' : 'Create Main Route'}
          </span>
        </div>
        <button
          onClick={() => { resetMainBuilder(); resetBuilder(); setMode('view'); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">

          {/* Selected sub-routes (ordered) */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Selected Sub-Routes ({selectedSubRoutes.length})
            </p>
            {selectedSubRoutes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-md">
                Add at least one sub-route below.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={mainRouteSubRouteIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {selectedSubRoutes.map((r) => (
                      <SortableSubRoute
                        key={r.id}
                        id={r.id}
                        name={r.name}
                        color={r.color}
                        isPartial={!!mainRouteSegments[r.id]}
                        isTrimming={trimTarget?.routeId === r.id}
                        onRemove={() => removeSubRouteFromMain(r.id)}
                        onTrim={() => setTrimTarget({ routeId: r.id, startIdx: null })}
                        onResetSegment={() => clearMainRouteSegment(r.id)}
                        onCancelTrim={() => setTrimTarget(null)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>

          <Separator />

          {/* Available sub-routes */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Available Sub-Routes
            </p>
            {availableSubRoutes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                {subRoutes.length === 0
                  ? 'No sub-routes yet. Create sub-routes first.'
                  : 'All sub-routes added.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {availableSubRoutes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => addSubRouteToMain(r.id)}
                    className="w-full flex items-center gap-3 p-3.5 min-h-[52px] rounded-lg border border-border hover:bg-accent active:scale-[0.98] text-left transition-colors touch-manipulation"
                  >
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-sm font-medium flex-1 break-words line-clamp-3">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.points.length} pts</span>
                    <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Direct waypoints */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Direct Waypoints ({manualPoints.length})
              </p>
              {!showAddPoint && (
                <button
                  onClick={() => setShowAddPoint(true)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              )}
            </div>

            {manualPoints.length > 0 && (
              <div className="space-y-1.5">
                {manualPoints.map((pt, i) => (
                  <div key={pt.id} className="flex items-center gap-2 bg-card border border-border rounded-md p-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium break-words">{pt.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {pt.position_after === 'start'
                          ? 'Before all sub-routes'
                          : pt.position_after
                          ? `After: ${selectedSubRoutes.find(r => r.id === pt.position_after)?.name ?? pt.position_after}`
                          : 'At the end'}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground capitalize">{pt.type}</span>
                    <button
                      onClick={() => startEditPoint(pt)}
                      className="text-muted-foreground hover:text-primary flex-shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setManualPoints((prev) => prev.filter((_, j) => j !== i).map((p, j) => ({ ...p, order: j })))}
                      className="text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showAddPoint && (
              <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
                <p className="text-xs font-semibold text-muted-foreground">
                  {editingPtId ? 'Edit Point' : 'Add Point'}
                </p>
                <Input
                  placeholder="Label *"
                  value={newPtLabel}
                  onChange={(e) => setNewPtLabel(e.target.value)}
                  className="h-11 text-sm touch-manipulation"
                />
                <select
                  value={newPtType}
                  onChange={(e) => setNewPtType(e.target.value as PointType)}
                  className="w-full h-11 text-sm rounded-lg border border-input bg-background px-3 touch-manipulation"
                >
                  <option value="waypoint">Waypoint</option>
                  <option value="poi">POI / Checkpost</option>
                  <option value="start">Start</option>
                  <option value="destination">Destination</option>
                </select>
                <select
                  value={newPtPosition}
                  onChange={(e) => setNewPtPosition(e.target.value)}
                  className="w-full h-11 text-sm rounded-lg border border-input bg-background px-3 touch-manipulation"
                >
                  <option value="">At the end</option>
                  <option value="start">Before all sub-routes</option>
                  {selectedSubRoutes.map((r) => (
                    <option key={r.id} value={r.id}>After: {r.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Input
                    placeholder="Latitude"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={newPtLat}
                    onChange={(e) => setNewPtLat(e.target.value)}
                    className="h-11 text-sm flex-1 touch-manipulation"
                  />
                  <Input
                    placeholder="Longitude"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={newPtLng}
                    onChange={(e) => setNewPtLng(e.target.value)}
                    className="h-11 text-sm flex-1 touch-manipulation"
                  />
                </div>
                {clickedCoord && (
                  <button
                    onClick={() => { setNewPtLat(String(clickedCoord.lat)); setNewPtLng(String(clickedCoord.lng)); }}
                    className="text-sm text-primary hover:underline flex items-center gap-1.5 min-h-[44px] touch-manipulation"
                  >
                    <MapPin className="w-4 h-4" />
                    Use map click ({clickedCoord.lat.toFixed(4)}, {clickedCoord.lng.toFixed(4)})
                  </button>
                )}
                <Input
                  placeholder="Note (optional)"
                  value={newPtNote}
                  onChange={(e) => setNewPtNote(e.target.value)}
                  className="h-11 text-sm touch-manipulation"
                />
                <div className="flex gap-2">
                  <Button onClick={addManualPoint} className="flex-1 h-12 text-base">
                    {editingPtId ? 'Save Point' : 'Add Point'}
                  </Button>
                  <Button variant="outline" onClick={cancelPointForm} className="flex-1 h-12 text-base">Cancel</Button>
                </div>
              </div>
            )}

            {manualPoints.length === 0 && !showAddPoint && (
              <p className="text-xs text-muted-foreground text-center py-2 border border-dashed border-border rounded-md">
                Add extra locations directly to this route.
              </p>
            )}
          </section>

          <Separator />

          {/* Metadata */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Main Route Details
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={mainRouteMeta.name ?? ''}
                onChange={(e) => { setUserEditedName(true); setMainRouteMeta({ name: e.target.value }); }}
                placeholder="Main route name"
                className="h-11 text-sm touch-manipulation"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={mainRouteMeta.description ?? ''}
                onChange={(e) => setMainRouteMeta({ description: e.target.value })}
                placeholder="Optional description"
                className="text-sm min-h-[60px] resize-none"
              />
            </div>
            <RouteColorPicker
              value={mainRouteMeta.color ?? '#3b82f6'}
              onChange={(c) => setMainRouteMeta({ color: c })}
            />
          </section>

          {saveError && (
            <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {saveError}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <Button onClick={handleSave} disabled={!canSave || isSaving} className="w-full h-12 text-base">
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {manualPoints.length > 0
                ? 'Routing & Saving…'
                : editingRouteId ? 'Updating…' : 'Saving…'}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {editingRouteId ? 'Update Main Route' : 'Save Main Route'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
