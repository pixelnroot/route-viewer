'use client';

import { useState, useMemo } from 'react';
import { X, Route, Loader2, Save, AlertCircle, MapPin, Plus, Navigation, Pencil, List, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import RoutePointList from './RoutePointList';
import RouteColorPicker from './RouteColorPicker';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { fetchRouteGoogle } from '@/lib/routing/google-directions';
import { haversineDistance, formatDistance, formatDuration } from '@/lib/routing/osrm';
import type { TravelMode } from '@/types/routes';

function parseCoord(input: string): { lat: number; lng: number } | null {
  const parts = input.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function RouteBuilder() {
  const {
    points,
    meta,
    builderTool,
    generatedGeometry,
    generatedDistance,
    generatedDuration,
    isGenerating,
    generateError,
    routeIsFallback,
    editingRouteId,
    categories,
    setMeta,
    setMode,
    setBuilderTool,
    setGeneratedGeometry,
    setIsGenerating,
    setGenerateError,
    addPoint,
    addSavedRoute,
    updateSavedRoute,
    selectRoute,
    resetBuilder,
    addPointAtLatLng,
    flyTo,
  } = useRouteBuilderStore();

  const { editKey, setEditKey } = useAuthStore();

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [coordInput, setCoordInput] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(true);

  const parsedCoord = useMemo(() => parseCoord(coordInput), [coordInput]);

  // Straight-line distance between first and last non-POI point
  const startEndDistance = useMemo(() => {
    const pathPts = [...points].sort((a, b) => a.order - b.order);
    if (pathPts.length < 2) return null;
    const first = pathPts[0];
    const last = pathPts[pathPts.length - 1];
    return haversineDistance(first.lat, first.lng, last.lat, last.lng);
  }, [points]);

  const canGenerate = points.length >= 2;
  const canSave = generatedGeometry !== null && meta.name?.trim();

  const handleFlyToCoord = () => {
    if (!parsedCoord) { setCoordError('Invalid coordinates'); return; }
    setCoordError(null);
    flyTo(parsedCoord.lat, parsedCoord.lng);
  };

  const handleAddCoord = () => {
    if (!parsedCoord) { setCoordError('Invalid coordinates'); return; }
    setCoordError(null);
    addPointAtLatLng(parsedCoord.lat, parsedCoord.lng);
    flyTo(parsedCoord.lat, parsedCoord.lng);
    setCoordInput('');
  };

  const handleBulkImport = () => {
    const raw = bulkInput.trim();
    if (!raw) { setBulkError('Paste coordinates first'); return; }
    const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) { setBulkError('Need at least 2 coordinates (separate with ;)'); return; }

    const coords: { lat: number; lng: number }[] = [];
    for (const p of parts) {
      const c = parseCoord(p);
      if (!c) { setBulkError(`Invalid: "${p}" — use "lat,lng" format`); return; }
      coords.push(c);
    }

    const hasExistingPath = points.filter(p => p.type !== 'poi').length > 0;
    coords.forEach((c, i) => {
      let type: 'start' | 'waypoint' | 'destination' = 'waypoint';
      if (!hasExistingPath && i === 0) type = 'start';
      if (!hasExistingPath && i === coords.length - 1) type = 'destination';
      const label =
        type === 'start' ? 'Start' :
        type === 'destination' ? 'Destination' :
        `Point ${points.length + i + 1}`;
      addPoint({ label, type, lat: c.lat, lng: c.lng });
    });

    flyTo(coords[0].lat, coords[0].lng);
    setBulkInput('');
    setBulkError(null);
    setShowBulk(false);
  };

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await fetchRouteGoogle(points, meta.travel_mode ?? 'driving');
      setGeneratedGeometry(result.geometry, result.distance, result.duration, result.isFallback);
      if (!result.isFallback) setGenerateError(null);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Route generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        name: meta.name!,
        description: meta.description ?? '',
        color: meta.color ?? '#3b82f6',
        status: meta.status ?? 'draft',
        risk_level: meta.risk_level ?? 'low',
        travel_mode: meta.travel_mode ?? 'driving',
        category_id: meta.category_id,
        points,
        geometry: generatedGeometry,
      };

      const isEdit = !!editingRouteId;
      const url = isEdit ? `/api/routes/${editingRouteId}` : '/api/routes';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${editKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setEditKey('');
        throw new Error('Invalid Edit Admin Key. Please try again.');
      }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const saved = await res.json();

      if (isEdit) {
        updateSavedRoute(saved);
        selectRoute(saved.id);
      } else {
        addSavedRoute(saved);
      }
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
          {editingRouteId ? <Pencil className="w-4 h-4 text-primary" /> : <Route className="w-4 h-4 text-primary" />}
          <span className="font-semibold text-sm">{editingRouteId ? 'Edit Route' : 'Create Route'}</span>
        </div>
        <button
          onClick={() => {
            resetBuilder();
            setMode('view');
            if (editingRouteId) selectRoute(editingRouteId);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-5">
          {/* Coordinate search — single point */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Add by Coordinate
            </p>
            <div className="flex gap-1">
              <Input
                value={coordInput}
                onChange={(e) => { setCoordInput(e.target.value); setCoordError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCoord(); }}
                placeholder="lat, lng — e.g. 21.51, 92.16"
                className="h-8 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={handleFlyToCoord}
                disabled={!parsedCoord}
                title="Fly to coordinate"
              >
                <Navigation className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={handleAddCoord}
                disabled={!parsedCoord}
                title="Add as route point"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {coordError && (
              <p className="text-xs text-destructive">{coordError}</p>
            )}
          </section>

          <Separator />

          {/* Bulk import */}
          <section className="space-y-2">
            <button
              onClick={() => setShowBulk(v => !v)}
              className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <List className="w-3.5 h-3.5" />
                Bulk Import Coordinates
              </span>
              {showBulk ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showBulk && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Paste all at once: <code className="bg-muted px-1 rounded">lat,lng;lat,lng;lat,lng</code>
                </p>
                <textarea
                  value={bulkInput}
                  onChange={(e) => { setBulkInput(e.target.value); setBulkError(null); }}
                  placeholder="21.5150,92.1633;21.5127,92.1742;21.5088,92.1743"
                  className="w-full h-28 text-xs font-mono rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {bulkError && (
                  <p className="text-xs text-destructive">{bulkError}</p>
                )}
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={handleBulkImport}
                  disabled={!bulkInput.trim()}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Import All Points
                </Button>
              </div>
            )}
          </section>

          <Separator />

          {/* Tool Toggle */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Map Tool (click on map)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={builderTool === 'draw_path' ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBuilderTool('draw_path')}
              >
                <Route className="w-3.5 h-3.5 mr-1.5" />
                Draw Path
              </Button>
              <Button
                variant={builderTool === 'add_poi' ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setBuilderTool('add_poi')}
              >
                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                Add Checkpost
              </Button>
            </div>
          </section>

          <Separator />

          {/* Points */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Route Points ({points.length})
              </p>
              {startEndDistance !== null && (
                <span className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                  ↔ {formatDistance(startEndDistance)}
                </span>
              )}
            </div>
            <RoutePointList />
          </section>

          <Separator />

          {/* Metadata */}
          <section className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Route Details
            </p>

            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input
                value={meta.name ?? ''}
                onChange={(e) => setMeta({ name: e.target.value })}
                placeholder="Route name"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={meta.description ?? ''}
                onChange={(e) => setMeta({ description: e.target.value })}
                placeholder="Optional description"
                className="text-sm min-h-[60px] resize-none"
              />
            </div>

            {categories.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={meta.category_id ?? ''}
                  onValueChange={(v) => setMeta({ category_id: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <RouteColorPicker
              value={meta.color ?? '#3b82f6'}
              onChange={(c) => setMeta({ color: c })}
            />
          </section>

          <Separator />

          {/* Generated route stats */}
          {generatedGeometry && (
            <section className="bg-muted/50 rounded-md p-3 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {routeIsFallback ? 'Straight-line Route' : 'Generated Route'}
              </p>
              {routeIsFallback && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No road found — connected with straight lines
                </p>
              )}
              {generatedDistance != null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Distance: </span>
                  {formatDistance(generatedDistance)}
                </p>
              )}
              {!routeIsFallback && generatedDuration != null && generatedDuration > 0 && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Duration: </span>
                  {formatDuration(generatedDuration)}
                </p>
              )}
            </section>
          )}

          {generateError && (
            <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {generateError}
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2 text-destructive text-xs bg-destructive/10 rounded-md p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {saveError}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0 space-y-2">
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="w-full h-9"
          variant="outline"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Route className="w-4 h-4 mr-2" />
              Generate Route
            </>
          )}
        </Button>

        <Button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="w-full h-9"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {editingRouteId ? 'Updating…' : 'Saving…'}
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {editingRouteId ? 'Update Route' : 'Save Route'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
