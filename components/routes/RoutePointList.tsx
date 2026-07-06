'use client';

import { useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Trash2, ChevronDown, ChevronUp, ImagePlus, X,
  Loader2, ArrowRight, Scissors, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useRouteFinderStore } from '@/lib/store/route-finder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { RoutePoint, PointType } from '@/types/routes';

const CATEGORY_ICONS: Record<string, string[]> = {
  checkpost: ['🚧', '🛡️', '🔒', '⛔', '🚔'],
  mosque: ['🕌', '🌙', '☪️'],
  school: ['🏫', '📚', '✏️'],
  hospital: ['🏥', '🚑', '➕'],
  other: ['📍', '📌', '⭐', '🔵', '🔴'],
};

const TYPE_COLORS: Record<PointType, string> = {
  start: 'bg-green-500',
  waypoint: 'bg-blue-500',
  poi: 'bg-yellow-500',
  destination: 'bg-red-500',
};

const TYPE_LABELS: Record<PointType, string> = {
  start: 'S',
  waypoint: 'W',
  poi: 'P',
  destination: 'D',
};

function SortablePoint({
  point, isLast, isFirst, collapseKey, collapseTarget,
}: {
  point: RoutePoint;
  isLast: boolean;
  isFirst: boolean;
  collapseKey: number;
  collapseTarget: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: point.id });

  const {
    updatePoint, removePoint,
    savedRoutes, editingRouteId,
    updateSavedRoute, addSavedRoute, loadRouteForEdit,
  } = useRouteBuilderStore();
  const { editKey } = useAuthStore();

  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [showSplitConfirm, setShowSplitConfirm] = useState(false);
  const [splitMode, setSplitMode] = useState<'create' | 'move'>('create');
  const [splitName, setSplitName] = useState('');
  const [splitTargetId, setSplitTargetId] = useState('');
  const [splitting, setSplitting] = useState(false);
  const [savingFinder, setSavingFinder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-saves showInFinder toggle directly to DB — no full Save Route click needed
  const handleToggleShowInFinder = async () => {
    if (!editingRouteId || !editKey || savingFinder) return;
    const newVal = !(point.showInFinder ?? false);
    updatePoint(point.id, { showInFinder: newVal }); // instant UI
    setSavingFinder(true);
    try {
      const { points: currentPoints } = useRouteBuilderStore.getState();
      const updatedPoints = currentPoints.map((p) =>
        p.id === point.id ? { ...p, showInFinder: newVal } : p
      );
      const res = await fetch(`/api/routes/${editingRouteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify({ points: updatedPoints }),
      });
      if (res.ok) {
        const saved = await res.json();
        updateSavedRoute(saved);
        useRouteFinderStore.getState().setFinderLocations([]); // force finder to re-fetch
      }
    } catch { /* silent */ } finally {
      setSavingFinder(false);
    }
  };

  // Sync expand state when collapse-all / expand-all is triggered
  useEffect(() => {
    setExpanded(collapseTarget);
  }, [collapseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const otherSubRoutes = editingRouteId
    ? savedRoutes.filter((r) => r.id !== editingRouteId && r.type !== 'main')
    : [];
  const isEditingSub = !!editingRouteId && savedRoutes.find((r) => r.id === editingRouteId)?.type !== 'main';

  const handleMoveToRoute = async (targetRouteId: string) => {
    if (!editingRouteId || !editKey) return;
    setMoving(true);
    setShowMoveMenu(false);

    const { points: builderPoints } = useRouteBuilderStore.getState();
    const newCurrentPoints = builderPoints
      .filter((p) => p.id !== point.id)
      .map((p, i) => ({ ...p, order: i }));

    const targetRoute = savedRoutes.find((r) => r.id === targetRouteId);
    if (!targetRoute) { setMoving(false); return; }
    const newTargetPoints = [...targetRoute.points, { ...point, order: targetRoute.points.length }];

    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/routes/${editingRouteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
          body: JSON.stringify({ points: newCurrentPoints, geometry: null }),
        }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
        fetch(`/api/routes/${targetRouteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
          body: JSON.stringify({ points: newTargetPoints, geometry: null }),
        }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
      ]);
      updateSavedRoute(r1);
      updateSavedRoute(r2);
      removePoint(point.id);
    } catch {
      // silently fail
    } finally {
      setMoving(false);
    }
  };

  // Split: this point and all after leave current route; go to new sub-route OR existing one
  const handleSplit = async () => {
    if (!editingRouteId || !editKey) return;
    setSplitting(true);

    const { points: builderPoints } = useRouteBuilderStore.getState();
    const idx = builderPoints.findIndex((p) => p.id === point.id);
    if (idx <= 0) { setSplitting(false); return; }

    const currentRoute = savedRoutes.find((r) => r.id === editingRouteId);
    if (!currentRoute) { setSplitting(false); return; }

    const keepPoints = builderPoints.slice(0, idx).map((p, i) => ({ ...p, order: i }));
    const splitPoints = builderPoints.slice(idx).map((p, i) => ({ ...p, order: i }));

    try {
      if (splitMode === 'create') {
        const newName = splitName.trim() || `${currentRoute.name} (split)`;
        const [r1, r2] = await Promise.all([
          fetch(`/api/routes/${editingRouteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
            body: JSON.stringify({ points: keepPoints, geometry: null }),
          }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
          fetch('/api/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
            body: JSON.stringify({
              name: newName,
              color: currentRoute.color,
              description: '',
              status: currentRoute.status ?? 'draft',
              risk_level: currentRoute.risk_level ?? 'low',
              travel_mode: currentRoute.travel_mode ?? 'driving',
              category_id: currentRoute.category_id,
              points: splitPoints,
              geometry: null,
            }),
          }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
        ]);
        updateSavedRoute(r1);
        addSavedRoute(r2);
        loadRouteForEdit(r1);
      } else {
        if (!splitTargetId) { setSplitting(false); return; }
        const targetRoute = savedRoutes.find((r) => r.id === splitTargetId);
        if (!targetRoute) { setSplitting(false); return; }
        const appendedPoints = [
          ...targetRoute.points,
          ...splitPoints.map((p, i) => ({ ...p, order: targetRoute.points.length + i })),
        ];
        const [r1, r2] = await Promise.all([
          fetch(`/api/routes/${editingRouteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
            body: JSON.stringify({ points: keepPoints, geometry: null }),
          }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
          fetch(`/api/routes/${splitTargetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
            body: JSON.stringify({ points: appendedPoints, geometry: null }),
          }).then((r) => (r.ok ? r.json() : Promise.reject(`${r.status}`))),
        ]);
        updateSavedRoute(r1);
        updateSavedRoute(r2);
        loadRouteForEdit(r1);
      }
      setShowSplitConfirm(false);
    } catch {
      // silently fail
    } finally {
      setSplitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${editKey}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Upload failed: ${res.status}`);
      }
      const { url } = await res.json();
      updatePoint(point.id, { imageUrl: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-border rounded-md p-2 space-y-2"
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        <div
          className={`w-6 h-6 rounded-full ${TYPE_COLORS[point.type]} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}
        >
          {TYPE_LABELS[point.type]}
        </div>

        <Input
          value={point.label}
          onChange={(e) => updatePoint(point.id, { label: e.target.value })}
          className="h-7 text-xs flex-1"
          placeholder="Label"
        />

        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Expand"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <button
          onClick={() => removePoint(point.id)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove point"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-8">
        <span>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
      </div>

      {expanded && (
        <div className="pl-8 space-y-2">
          <Select
            value={point.type}
            onValueChange={(v) => updatePoint(point.id, { type: v as PointType })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">Start</SelectItem>
              <SelectItem value="waypoint">Waypoint</SelectItem>
              <SelectItem value="poi">POI</SelectItem>
              <SelectItem value="destination">Destination</SelectItem>
            </SelectContent>
          </Select>

          {/* Show in Find Route dropdown toggle — auto-saves to DB immediately */}
          <button
            type="button"
            onClick={handleToggleShowInFinder}
            disabled={savingFinder || !editingRouteId}
            className={cn(
              'w-full h-7 text-[10px] font-medium rounded border transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50',
              (point.showInFinder ?? false)
                ? 'bg-primary/10 text-primary border-primary/40 hover:bg-primary/20'
                : 'border-border text-muted-foreground hover:bg-accent/50'
            )}
          >
            {savingFinder ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <span className={cn('w-2 h-2 rounded-full', (point.showInFinder ?? false) ? 'bg-primary' : 'bg-muted-foreground/40')} />
            )}
            {(point.showInFinder ?? false) ? 'Shown in Find Route' : 'Hidden from Find Route'}
          </button>

          <div className="grid grid-cols-2 gap-1">
            <Input
              value={point.lat.toFixed(6)}
              onChange={(e) => updatePoint(point.id, { lat: parseFloat(e.target.value) || point.lat })}
              className="h-7 text-xs"
              placeholder="Lat"
            />
            <Input
              value={point.lng.toFixed(6)}
              onChange={(e) => updatePoint(point.id, { lng: parseFloat(e.target.value) || point.lng })}
              className="h-7 text-xs"
              placeholder="Lng"
            />
          </div>

          {point.type === 'poi' && (
            <div className="space-y-2 mt-2 pt-2 border-t border-border">
              <Select
                value={point.category ?? 'checkpost'}
                onValueChange={(v) => updatePoint(point.id, { category: v as any, icon: undefined })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkpost">Checkpost</SelectItem>
                  <SelectItem value="mosque">Mosque</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="hospital">Hospital</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium">Icon</p>
                <div className="flex flex-wrap gap-1">
                  {(CATEGORY_ICONS[point.category ?? 'checkpost'] ?? CATEGORY_ICONS.other).map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => updatePoint(point.id, { icon: point.icon === emoji ? undefined : emoji })}
                      className={cn(
                        'w-7 h-7 text-base flex items-center justify-center rounded border transition-colors',
                        point.icon === emoji
                          ? 'border-primary bg-accent'
                          : 'border-border hover:bg-accent/50'
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                  <Input
                    value={
                      point.icon && !(CATEGORY_ICONS[point.category ?? 'checkpost'] ?? []).includes(point.icon)
                        ? point.icon
                        : ''
                    }
                    onChange={(e) => updatePoint(point.id, { icon: e.target.value || undefined })}
                    className="h-7 w-12 text-center text-base px-1"
                    placeholder="✏️"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Segment routing mode */}
          {!isLast && (
            <div className="space-y-1 mt-2 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground font-medium">To next point:</p>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => updatePoint(point.id, { segmentMode: 'auto' })}
                  className={cn(
                    'h-7 text-[10px] font-medium rounded border transition-colors',
                    (!point.segmentMode || point.segmentMode === 'auto')
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  ↷ Auto Route
                </button>
                <button
                  type="button"
                  onClick={() => updatePoint(point.id, { segmentMode: 'direct' })}
                  className={cn(
                    'h-7 text-[10px] font-medium rounded border transition-colors',
                    point.segmentMode === 'direct'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  — Direct Line
                </button>
              </div>
            </div>
          )}

          {/* Move to another sub-route */}
          {isEditingSub && otherSubRoutes.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              {showMoveMenu ? (
                <div className="flex gap-1">
                  <select
                    className="flex-1 h-7 text-xs border border-border rounded bg-background px-1"
                    onChange={(e) => { if (e.target.value) handleMoveToRoute(e.target.value); }}
                    defaultValue=""
                  >
                    <option value="" disabled>Move to…</option>
                    {otherSubRoutes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowMoveMenu(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowMoveMenu(true)}
                  disabled={moving}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  {moving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3 h-3" />
                  )}
                  Move to sub-route
                </button>
              )}
            </div>
          )}

          {/* Split from here */}
          {isEditingSub && !isFirst && (
            <div className="mt-2 pt-2 border-t border-border">
              {showSplitConfirm ? (
                <div className="space-y-1.5">
                  {/* Mode toggle */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setSplitMode('create')}
                      className={cn(
                        'flex-1 h-6 text-[10px] font-medium rounded border transition-colors',
                        splitMode === 'create'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      )}
                    >
                      New sub-route
                    </button>
                    <button
                      onClick={() => setSplitMode('move')}
                      disabled={otherSubRoutes.length === 0}
                      className={cn(
                        'flex-1 h-6 text-[10px] font-medium rounded border transition-colors disabled:opacity-40',
                        splitMode === 'move'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      )}
                    >
                      To existing
                    </button>
                  </div>

                  {splitMode === 'create' ? (
                    <Input
                      value={splitName}
                      onChange={(e) => setSplitName(e.target.value)}
                      className="h-7 text-xs"
                      placeholder={`${savedRoutes.find(r => r.id === editingRouteId)?.name ?? ''} (split)`}
                      autoFocus
                    />
                  ) : (
                    <select
                      value={splitTargetId}
                      onChange={(e) => setSplitTargetId(e.target.value)}
                      className="w-full h-7 text-xs border border-border rounded bg-background px-1"
                    >
                      <option value="" disabled>Select sub-route…</option>
                      {otherSubRoutes.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}

                  <div className="flex gap-1">
                    <button
                      onClick={handleSplit}
                      disabled={splitting || (splitMode === 'move' && !splitTargetId)}
                      className="flex-1 h-7 text-[10px] font-medium rounded border bg-primary text-primary-foreground border-primary hover:opacity-90 flex items-center justify-center gap-1 transition-opacity disabled:opacity-50"
                    >
                      {splitting && <Loader2 className="w-3 h-3 animate-spin" />}
                      {splitMode === 'create' ? 'Split' : 'Move'}
                    </button>
                    <button
                      onClick={() => {
                        setShowSplitConfirm(false);
                        setSplitName('');
                        setSplitTargetId('');
                      }}
                      className="flex-1 h-7 text-[10px] font-medium rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowSplitConfirm(true)}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                >
                  <Scissors className="w-3 h-3" />
                  Split from here
                </button>
              )}
            </div>
          )}

          {/* Note + image */}
          <div className="space-y-1.5 mt-2 pt-2 border-t border-border">
            <Textarea
              value={point.note ?? ''}
              onChange={(e) => updatePoint(point.id, { note: e.target.value })}
              className="text-xs min-h-[48px] resize-none"
              placeholder="Note (optional)"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {point.imageUrl ? (
              <div className="relative">
                <img
                  src={point.imageUrl}
                  alt="Point image"
                  className="w-full h-28 object-cover rounded-md border border-border"
                />
                <button
                  type="button"
                  onClick={() => updatePoint(point.id, { imageUrl: undefined })}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-16 border border-dashed border-border rounded-md flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-accent/30 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[10px]">Uploading…</span></>
                ) : (
                  <><ImagePlus className="w-4 h-4" /><span className="text-[10px]">Upload image</span></>
                )}
              </button>
            )}
            {uploadError && <p className="text-[10px] text-destructive">{uploadError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoutePointList() {
  const { points, reorderPoints, addPointAtLatLng } = useRouteBuilderStore();
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [collapseKey, setCollapseKey] = useState(0);
  const [collapseExpanded, setCollapseExpanded] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = points.map((p) => p.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    const reordered = arrayMove(ids, oldIdx, newIdx);
    reorderPoints(reordered);
  };

  const handleManualAdd = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) return;
    addPointAtLatLng(lat, lng);
    setManualLat('');
    setManualLng('');
  };

  const toggleAll = () => {
    const next = !collapseExpanded;
    setCollapseExpanded(next);
    setCollapseKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      {points.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Click map to add route points, or enter coordinates below.
        </p>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{points.length} point{points.length !== 1 ? 's' : ''}</span>
          <button
            onClick={toggleAll}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            {collapseExpanded
              ? <><ChevronsDownUp className="w-3 h-3" /> Collapse All</>
              : <><ChevronsUpDown className="w-3 h-3" /> Expand All</>
            }
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={points.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {points.map((p, idx) => (
              <SortablePoint
                key={p.id}
                point={p}
                isFirst={idx === 0}
                isLast={idx === points.length - 1}
                collapseKey={collapseKey}
                collapseTarget={collapseExpanded}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex gap-1 pt-1">
        <Input
          value={manualLat}
          onChange={(e) => setManualLat(e.target.value)}
          className="h-7 text-xs"
          placeholder="Lat"
        />
        <Input
          value={manualLng}
          onChange={(e) => setManualLng(e.target.value)}
          className="h-7 text-xs"
          placeholder="Lng"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualAdd}
          className="h-7 text-xs px-2 flex-shrink-0"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
