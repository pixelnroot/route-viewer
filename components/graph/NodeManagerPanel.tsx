'use client';

import { useState, useMemo } from 'react';
import { Search, MapPin, Eye, EyeOff, Trash2, Merge, Check, Loader2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useGraphStore } from '@/lib/store/graph-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { GraphNode } from '@/types/graph';

/** Rename nodes, toggle finder visibility, merge duplicates, delete orphans. */
export default function NodeManagerPanel({ onGraphChanged }: { onGraphChanged: () => void }) {
  const { editKey } = useAuthStore();
  const flyTo = useRouteBuilderStore((s) => s.flyTo);
  const { graphData, selectedNodeId, setSelectedNodeId } = useGraphStore();
  const [query, setQuery] = useState('');
  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of graphData?.edges ?? []) {
      d.set(e.fromNodeId, (d.get(e.fromNodeId) ?? 0) + 1);
      d.set(e.toNodeId, (d.get(e.toNodeId) ?? 0) + 1);
    }
    return d;
  }, [graphData]);

  const filtered = useMemo(() => {
    if (!graphData) return [];
    const q = query.toLowerCase();
    return graphData.nodes
      .filter((n) => !q || (n.name ?? '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [graphData, query]);

  if (!graphData) return null;

  const patchNode = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/graph/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Update failed: ${res.status}`);
      onGraphChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteNode = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/graph/nodes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editKey}` },
      });
      if (res.status === 409) throw new Error('Node still has connected edges');
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      if (selectedNodeId === id) setSelectedNodeId(null);
      onGraphChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const renderNode = (node: GraphNode) => {
    const isSelected = node.id === selectedNodeId;
    const deg = degree.get(node.id) ?? 0;
    const isMergeSource = mergeSource === node.id;
    return (
      <div
        key={node.id}
        className={cn('rounded-lg border p-2 text-xs space-y-1.5', isSelected ? 'border-primary bg-primary/5' : 'border-border', isMergeSource && 'border-amber-500')}
      >
        <div className="flex items-center gap-1.5">
          <button
            className="flex-1 text-left truncate font-medium"
            onClick={() => { setSelectedNodeId(isSelected ? null : node.id); flyTo(node.lat, node.lng); }}
          >
            {node.name ?? <span className="text-muted-foreground italic">(unnamed {node.kind})</span>}
          </button>
          <span className="text-muted-foreground flex-shrink-0">{deg} edge{deg === 1 ? '' : 's'}</span>
        </div>

        {isSelected && (
          <>
            <div className="flex gap-1.5">
              <Input
                value={renameValue ?? node.name ?? ''}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Node name"
                className="h-7 text-xs"
              />
              <button
                disabled={busy || renameValue === null || renameValue === node.name}
                onClick={() => { patchNode(node.id, { name: renameValue }); setRenameValue(null); }}
                className="px-2 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                disabled={busy}
                onClick={() => patchNode(node.id, { showInFinder: !node.showInFinder })}
                className={cn('flex items-center gap-1 px-1.5 py-1 rounded border', node.showInFinder ? 'border-green-500 text-green-600' : 'border-border text-muted-foreground')}
              >
                {node.showInFinder ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {node.showInFinder ? 'In finder' : 'Hidden'}
              </button>
              <button
                disabled={busy}
                onClick={() => flyTo(node.lat, node.lng)}
                className="flex items-center gap-1 px-1.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
              >
                <MapPin className="w-3 h-3" /> Show
              </button>
              {mergeSource && mergeSource !== node.id ? (
                <button
                  disabled={busy}
                  onClick={() => { patchNode(node.id, { mergeNodeId: mergeSource }); setMergeSource(null); }}
                  className="flex items-center gap-1 px-1.5 py-1 rounded border border-amber-500 text-amber-600"
                >
                  <Merge className="w-3 h-3" /> Merge into this
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => setMergeSource(isMergeSource ? null : node.id)}
                  className={cn('flex items-center gap-1 px-1.5 py-1 rounded border', isMergeSource ? 'border-amber-500 text-amber-600' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  <Merge className="w-3 h-3" /> {isMergeSource ? 'Cancel merge' : 'Merge…'}
                </button>
              )}
              {deg === 0 && (
                <button
                  disabled={busy}
                  onClick={() => deleteNode(node.id)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded border border-destructive/40 text-destructive"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {mergeSource && (
        <p className="text-xs text-amber-600 bg-amber-500/10 rounded-lg px-2.5 py-2">
          Merge mode: select the node to KEEP, then press &ldquo;Merge into this&rdquo;. The other node&apos;s edges move to it.
        </p>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search nodes…" className="pl-8 h-8 text-xs" />
      </div>
      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />}
      <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
        {filtered.map(renderNode)}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No nodes found</p>}
      </div>
    </div>
  );
}
