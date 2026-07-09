'use client';

import { useEffect, useCallback, useState } from 'react';
import { Waypoints, Link2, ListTree, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGraphStore } from '@/lib/store/graph-store';
import { useAuthStore } from '@/lib/store/auth-store';
import ConnectorTool from './ConnectorTool';
import NodeManagerPanel from './NodeManagerPanel';
import type { GraphData } from '@/types/graph';

/** Graph tab of the admin sidebar: topology overlay controls + node/connector tools. */
export default function GraphAdminPanel() {
  const { editKey } = useAuthStore();
  const { graphData, graphAdminMode, setGraphData, setGraphAdminMode } = useGraphStore();
  const [tool, setTool] = useState<'nodes' | 'connector'>('nodes');
  const [loading, setLoading] = useState(false);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/graph', { headers: { Authorization: `Bearer ${editKey}` } });
      if (res.ok) setGraphData((await res.json()) as GraphData);
    } catch { /* leave stale data */ }
    finally { setLoading(false); }
  }, [editKey, setGraphData]);

  // Load once on mount (deferred past the render commit); hide overlay on unmount
  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!useGraphStore.getState().graphData) return loadGraph();
    });
    return () => useGraphStore.getState().setGraphAdminMode('off');
  }, [loadGraph]);

  const selectTool = (t: 'nodes' | 'connector') => {
    setTool(t);
    setGraphAdminMode(t === 'connector' ? 'connector' : 'view');
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Waypoints className="w-4 h-4 text-primary" />
          Topology
          {graphData && (
            <span className="text-xs text-muted-foreground font-normal">
              {graphData.nodes.length} nodes · {graphData.edges.length} edges
            </span>
          )}
        </div>
        <button
          onClick={loadGraph}
          className="text-muted-foreground hover:text-foreground p-1"
          aria-label="Reload graph"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => selectTool('nodes')}
          className={cn('flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5', tool === 'nodes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
        >
          <ListTree className="w-3.5 h-3.5" /> Nodes
        </button>
        <button
          onClick={() => selectTool('connector')}
          className={cn('flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1.5', tool === 'connector' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
        >
          <Link2 className="w-3.5 h-3.5" /> Connector
        </button>
      </div>

      {graphAdminMode === 'connector'
        ? <ConnectorTool onGraphChanged={loadGraph} />
        : <NodeManagerPanel onGraphChanged={loadGraph} />}
    </div>
  );
}
