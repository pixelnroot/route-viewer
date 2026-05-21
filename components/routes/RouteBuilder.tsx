'use client';

import { useState } from 'react';
import { X, Route, Loader2, Save, AlertCircle, MapPin, MousePointer2 } from 'lucide-react';
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
import { fetchOSRMRoute, formatDistance, formatDuration } from '@/lib/routing/osrm';
import type { RouteStatus, RiskLevel, TravelMode } from '@/types/routes';

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
    setMeta,
    setMode,
    setBuilderTool,
    setGeneratedGeometry,
    setIsGenerating,
    setGenerateError,
    addSavedRoute,
    resetBuilder,
  } = useRouteBuilderStore();

  const { editKey, setEditKey } = useAuthStore();

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const canGenerate = points.length >= 2;
  const canSave = generatedGeometry !== null && meta.name?.trim();

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const result = await fetchOSRMRoute(points, meta.travel_mode ?? 'driving');
      setGeneratedGeometry(result.geometry, result.distance, result.duration);
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
        points,
        geometry: generatedGeometry,
      };
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${editKey}`
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setEditKey('');
        throw new Error('Invalid Edit Admin Key. Please try again.');
      }
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const saved = await res.json();
      addSavedRoute(saved);
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
          <Route className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Create Route</span>
        </div>
        <button
          onClick={() => { resetBuilder(); setMode('view'); }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-5">
          {/* Tool Toggle */}
          <section className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Map Tool
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Route Points ({points.length})
            </p>
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={meta.status ?? 'draft'}
                  onValueChange={(v) => setMeta({ status: v as RouteStatus })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Risk Level</Label>
                <Select
                  value={meta.risk_level ?? 'low'}
                  onValueChange={(v) => setMeta({ risk_level: v as RiskLevel })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Travel Mode</Label>
              <Select
                value={meta.travel_mode ?? 'driving'}
                onValueChange={(v) => setMeta({ travel_mode: v as TravelMode })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="driving">Driving</SelectItem>
                  <SelectItem value="walking">Walking</SelectItem>
                  <SelectItem value="cycling">Cycling</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                Generated Route
              </p>
              {generatedDistance != null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Distance: </span>
                  {formatDistance(generatedDistance)}
                </p>
              )}
              {generatedDuration != null && (
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
              Saving…
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
