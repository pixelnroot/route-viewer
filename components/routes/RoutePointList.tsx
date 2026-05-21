'use client';

import { useState, useRef } from 'react';
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
import { GripVertical, Trash2, ChevronDown, ChevronUp, ImagePlus, X, Loader2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
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

function SortablePoint({ point, isLast }: { point: RoutePoint; isLast: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: point.id });

  const { updatePoint, removePoint } = useRouteBuilderStore();
  const { editKey } = useAuthStore();
  const [expanded, setExpanded] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

          {/* Segment routing mode (hidden for last point — no next segment) */}
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

          <div className="space-y-1.5 mt-2 pt-2 border-t border-border">
            <Textarea
              value={point.note ?? ''}
              onChange={(e) => updatePoint(point.id, { note: e.target.value })}
              className="text-xs min-h-[48px] resize-none"
              placeholder="Note (optional)"
            />

            {/* Image upload */}
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
  const { points, reorderPoints, addPointAtLatLng, meta } = useRouteBuilderStore();
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

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

  return (
    <div className="space-y-3">
      {points.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          Click map to add route points, or enter coordinates below.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={points.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {points.map((p, idx) => (
              <SortablePoint key={p.id} point={p} isLast={idx === points.length - 1} />
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
