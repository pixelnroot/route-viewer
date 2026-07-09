'use client';

import { create } from 'zustand';
import type { GraphData } from '@/types/graph';
import type { CompileResult, SubrouteDraft } from '@/lib/graph/compiler';

export type GraphAdminMode = 'off' | 'view' | 'connector';

interface PendingCompile {
  draft: SubrouteDraft;
  result: CompileResult;
  /** proposal id → accepted */
  decisions: Record<string, boolean>;
}

interface GraphState {
  graphData: GraphData | null;
  graphAdminMode: GraphAdminMode;
  connectorNodeA: string | null;
  connectorNodeB: string | null;
  pendingCompile: PendingCompile | null;
  selectedNodeId: string | null;

  setGraphData: (g: GraphData | null) => void;
  setGraphAdminMode: (m: GraphAdminMode) => void;
  setConnectorNode: (slot: 'A' | 'B', id: string | null) => void;
  setPendingCompile: (p: PendingCompile | null) => void;
  setProposalDecision: (proposalId: string, accepted: boolean) => void;
  setSelectedNodeId: (id: string | null) => void;
  resetGraphAdmin: () => void;
}

export const useGraphStore = create<GraphState>()((set) => ({
  graphData: null,
  graphAdminMode: 'off',
  connectorNodeA: null,
  connectorNodeB: null,
  pendingCompile: null,
  selectedNodeId: null,

  setGraphData: (g) => set({ graphData: g }),
  setGraphAdminMode: (m) => set({ graphAdminMode: m, connectorNodeA: null, connectorNodeB: null }),
  setConnectorNode: (slot, id) => set(slot === 'A' ? { connectorNodeA: id } : { connectorNodeB: id }),
  setPendingCompile: (p) =>
    set({
      pendingCompile: p
        ? { ...p, decisions: Object.fromEntries(p.result.proposals.map((pr) => [pr.id, true])) }
        : null,
    }),
  setProposalDecision: (proposalId, accepted) =>
    set((s) =>
      s.pendingCompile
        ? { pendingCompile: { ...s.pendingCompile, decisions: { ...s.pendingCompile.decisions, [proposalId]: accepted } } }
        : {}
    ),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  resetGraphAdmin: () =>
    set({ graphAdminMode: 'off', connectorNodeA: null, connectorNodeB: null, pendingCompile: null, selectedNodeId: null }),
}));
