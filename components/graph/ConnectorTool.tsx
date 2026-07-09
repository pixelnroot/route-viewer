'use client';

import { useState } from 'react';
import { Link2, Loader2, AlertCircle, MapPin, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGraphStore } from '@/lib/store/graph-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { fetchRouteGoogle } from '@/lib/routing/google-directions';
import { formatDistance } from '@/lib/routing/osrm';
import type { RoutePoint } from '@/types/routes';
import type { GraphNode } from '@/types/graph';

function nodePoint(node: GraphNode, order: number): RoutePoint {
  return {
    id: node.id, label: node.name ?? 'node', type: order === 0 ? 'start' : 'destination',
    lat: node.lat, lng: node.lng, order,
  };
}

/**
 * Persist a bridge edge between two nodes: pick A and B (on map or from a
 * suggestion), fetch road geometry via Google, save via POST /api/graph/edges.
 */
export default function ConnectorTool({ onGraphChanged }: { onGraphChanged: () => void }) {
  const { editKey } = useAuthStore();
  const flyTo = useRouteBuilderStore((s) => s.flyTo);
  const { graphData, connectorNodeA, connectorNodeB, setConnectorNode } = useGraphStore();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  if (!graphData) return null;
  const nodeA = graphData.nodes.find((n) => n.id === connectorNodeA) ?? null;
  const nodeB = graphData.nodes.find((n) => n.id === connectorNodeB) ?? null;

  const createBridge = async (fromId: string, toId: string, suggestionId?: string) => {
    const from = graphData.nodes.find((n) => n.id === fromId);
    const to = graphData.nodes.find((n) => n.id === toId);
    if (!from || !to) return;
    setIsSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const result = await fetchRouteGoogle([nodePoint(from, 0), nodePoint(to, 1)], 'driving');
      const res = await fetch('/api/graph/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify({
          fromNodeId: from.id, toNodeId: to.id,
          geometry: result.geometry, duration: result.duration,
          suggestionId,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setSavedMsg(`Connected: ${from.name ?? '?'} ↔ ${to.name ?? '?'}${result.isFallback ? ' (straight line — no road found)' : ''}`);
      setConnectorNode('A', null);
      setConnectorNode('B', null);
      onGraphChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create connector');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-xs text-muted-foreground">Click two nodes on the map, then connect them with a road bridge.</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-4 text-muted-foreground">A</span>
          <span className="flex-1 truncate font-medium">{nodeA ? (nodeA.name ?? '(junction)') : '— click a node —'}</span>
          {nodeA && <button onClick={() => setConnectorNode('A', null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-4 text-muted-foreground">B</span>
          <span className="flex-1 truncate font-medium">{nodeB ? (nodeB.name ?? '(junction)') : '— click a node —'}</span>
          {nodeB && <button onClick={() => setConnectorNode('B', null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Button
          size="sm" className="w-full"
          disabled={!nodeA || !nodeB || isSaving}
          onClick={() => nodeA && nodeB && createBridge(nodeA.id, nodeB.id)}
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
          Connect A ↔ B
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {savedMsg && (
        <div className="flex items-start gap-2 text-xs text-green-600 bg-green-500/10 rounded-lg px-2.5 py-2">
          <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{savedMsg}</span>
        </div>
      )}

      {graphData.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Suggested connections ({graphData.suggestions.length})
          </p>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {graphData.suggestions.map((s) => {
              const a = graphData.nodes.find((n) => n.id === s.nodeAId);
              const b = graphData.nodes.find((n) => n.id === s.nodeBId);
              if (!a || !b) return null;
              return (
                <div key={s.id} className="rounded-lg border border-border p-2 text-xs space-y-1.5">
                  <p className="leading-snug">{a.name ?? '?'} ↔ {b.name ?? '?'} <span className="text-muted-foreground">({formatDistance(s.distance)})</span></p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => flyTo((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-1.5 py-1 rounded border border-border"
                    >
                      <MapPin className="w-3 h-3" /> Show
                    </button>
                    <button
                      onClick={() => createBridge(s.nodeAId, s.nodeBId, s.id)}
                      disabled={isSaving}
                      className="flex items-center gap-1 text-primary hover:bg-primary/10 px-1.5 py-1 rounded border border-primary/40"
                    >
                      <Link2 className="w-3 h-3" /> Connect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
