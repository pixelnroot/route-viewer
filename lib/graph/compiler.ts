import { v4 as uuidv4 } from 'uuid';
import type { RoutePoint } from '@/types/routes';
import type { GraphData, GraphNode, GraphSegmentEdge, SubRouteDef } from '@/types/graph';
import { haversineDistance } from '@/lib/routing/osrm';
import { nearestCoordIndex } from '@/lib/utils';
import {
  bbox,
  bboxesOverlap,
  lineDistance,
  nearestPointOnPolyline,
  splitLineAt,
  splitLineAtIndex,
  type Coord,
} from './geometry';

export const ENDPOINT_SNAP_M = 50;
export const JUNCTION_DETECT_M = 20;

export interface SubrouteDraft {
  id?: string; // present on re-compile of an existing sub-route
  geometry: GeoJSON.LineString;
  points: RoutePoint[];
  meta: Omit<SubRouteDef, 'id' | 'edgeIds' | 'points' | 'created_at' | 'updated_at'>;
}

export interface JunctionProposal {
  id: string;
  existingEdgeId: string;
  /** where the junction lands on the existing edge */
  atExisting: { segIdx: number; t: number; lat: number; lng: number };
  /** nearest coord index on the draft polyline */
  atDraftCoordIdx: number;
  distM: number;
  /** names of sub-routes the existing edge belongs to, for the review UI */
  existingSubrouteNames: string[];
}

export interface CompileResult {
  snappedStartNodeId: string | null; // existing node the draft start will reuse (≤50 m)
  snappedEndNodeId: string | null;
  proposals: JunctionProposal[];
}

function nearestNode(graph: GraphData, lat: number, lng: number, maxM: number): GraphNode | null {
  let best: GraphNode | null = null;
  let bestD = Infinity;
  for (const n of graph.nodes) {
    const d = haversineDistance(n.lat, n.lng, lat, lng);
    if (d < bestD) { bestD = d; best = n; }
  }
  return bestD <= maxM ? best : null;
}

/**
 * Dry-run: where would this draft connect to the existing graph?
 * Endpoint snaps (both ends) + junction proposals at every local minimum of
 * the draft-to-edge distance below 20 m. Never applies anything — parallel
 * roads produce false positives, so the admin confirms each proposal.
 */
export function compileSubroute(graph: GraphData, draft: SubrouteDraft): CompileResult {
  const coords = draft.geometry.coordinates as Coord[];
  const last = coords.length - 1;
  const [startLng, startLat] = coords[0];
  const [endLng, endLat] = coords[last];

  const snappedStart = nearestNode(graph, startLat, startLng, ENDPOINT_SNAP_M);
  const snappedEnd = nearestNode(graph, endLat, endLng, ENDPOINT_SNAP_M);

  const proposals: JunctionProposal[] = [];
  const draftBox = bbox(coords);
  const subrouteName = (id: string) => graph.subroutes.find((s) => s.id === id)?.name ?? id;
  // ignore edges the draft itself owns when re-compiling an existing route
  const ownEdges = draft.id
    ? new Set(graph.subroutes.find((s) => s.id === draft.id)?.edgeIds ?? [])
    : new Set<string>();

  for (const edge of graph.edges) {
    if (edge.source !== 'drawn' || ownEdges.has(edge.id)) continue;
    const edgeCoords = edge.geometry.coordinates as Coord[];
    if (!bboxesOverlap(bbox(edgeCoords), draftBox, JUNCTION_DETECT_M)) continue;

    // Walk the draft; find local minima of distance-to-edge below threshold.
    // One proposal per minimum collapses a parallel-road run into one candidate.
    let run: { minD: number; minIdx: number; proj: ReturnType<typeof nearestPointOnPolyline> } | null = null;
    for (let i = 0; i <= last; i++) {
      const [lng, lat] = coords[i];
      const proj = nearestPointOnPolyline(edgeCoords, lat, lng);
      if (proj.distM <= JUNCTION_DETECT_M) {
        if (!run || proj.distM < run.minD) run = { minD: proj.distM, minIdx: i, proj };
      } else if (run) {
        proposals.push(makeProposal(edge, run, subrouteName));
        run = null;
      }
    }
    if (run) proposals.push(makeProposal(edge, run, subrouteName));
  }

  // Endpoint snaps make junction proposals at the same spot redundant
  const filtered = proposals.filter((p) => {
    const nearStart = snappedStart && haversineDistance(p.atExisting.lat, p.atExisting.lng, snappedStart.lat, snappedStart.lng) <= ENDPOINT_SNAP_M && (p.atDraftCoordIdx === 0);
    const nearEnd = snappedEnd && haversineDistance(p.atExisting.lat, p.atExisting.lng, snappedEnd.lat, snappedEnd.lng) <= ENDPOINT_SNAP_M && (p.atDraftCoordIdx === last);
    return !nearStart && !nearEnd;
  });

  return {
    snappedStartNodeId: snappedStart?.id ?? null,
    snappedEndNodeId: snappedEnd?.id ?? null,
    proposals: filtered,
  };
}

function makeProposal(
  edge: GraphSegmentEdge,
  run: { minD: number; minIdx: number; proj: ReturnType<typeof nearestPointOnPolyline> },
  subrouteName: (id: string) => string
): JunctionProposal {
  return {
    id: uuidv4(),
    existingEdgeId: edge.id,
    atExisting: { segIdx: run.proj.segIdx, t: run.proj.t, lat: run.proj.lat, lng: run.proj.lng },
    atDraftCoordIdx: run.minIdx,
    distM: Math.round(run.minD * 10) / 10,
    existingSubrouteNames: edge.subrouteIds.map(subrouteName),
  };
}

// ── Apply ─────────────────────────────────────────────────────────────────────

/** Split an existing edge at a projected point; rewires every subroute's edgeIds. Returns the junction node. */
function splitEdgeAt(graph: GraphData, edgeId: string, segIdx: number, t: number, at: { lat: number; lng: number }): GraphNode {
  const edge = graph.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error(`splitEdgeAt: edge ${edgeId} not found`);

  const existing = nearestNode(graph, at.lat, at.lng, ENDPOINT_SNAP_M);
  if (existing && (existing.id === edge.fromNodeId || existing.id === edge.toNodeId)) {
    return existing; // junction lands on the edge's own endpoint — nothing to split
  }

  const node: GraphNode = existing ?? {
    id: uuidv4(), kind: 'junction', lat: at.lat, lng: at.lng, showInFinder: false,
  };
  if (!existing) graph.nodes.push(node);

  const [coordsA, coordsB] = splitLineAt(edge.geometry.coordinates as Coord[], segIdx, t);
  if (coordsA.length < 2 || coordsB.length < 2) return node; // degenerate split at a vertex boundary

  const halfA: GraphSegmentEdge = {
    ...edge, id: uuidv4(), toNodeId: node.id,
    geometry: { type: 'LineString', coordinates: coordsA }, distance: lineDistance(coordsA),
    subrouteIds: [...edge.subrouteIds],
  };
  const halfB: GraphSegmentEdge = {
    ...edge, id: uuidv4(), fromNodeId: node.id,
    geometry: { type: 'LineString', coordinates: coordsB }, distance: lineDistance(coordsB),
    subrouteIds: [...edge.subrouteIds],
  };

  graph.edges = graph.edges.filter((e) => e.id !== edge.id);
  graph.edges.push(halfA, halfB);
  for (const def of graph.subroutes) {
    const idx = def.edgeIds.indexOf(edge.id);
    if (idx !== -1) def.edgeIds.splice(idx, 1, halfA.id, halfB.id);
  }
  return node;
}

/**
 * Apply a compiled draft: create junction nodes (splitting host edges), split
 * the draft at its accepted crossing indices, insert edges + SubRouteDef.
 * Mutates and returns the given graph object.
 */
export function applySubroute(
  graph: GraphData,
  draft: SubrouteDraft,
  acceptedProposals: JunctionProposal[]
): SubRouteDef {
  if (draft.id) removeSubroute(graph, draft.id); // re-compile = replace topology

  const coords = draft.geometry.coordinates as Coord[];
  const last = coords.length - 1;

  // 1. Junction nodes on host edges
  const junctionByDraftIdx = new Map<number, GraphNode>();
  for (const p of acceptedProposals) {
    const node = splitEdgeAt(graph, p.existingEdgeId, p.atExisting.segIdx, p.atExisting.t, p.atExisting);
    const idx = Math.max(0, Math.min(last, p.atDraftCoordIdx));
    junctionByDraftIdx.set(idx, node);
  }

  // 2. Draft split indices: endpoints + interior waypoints + accepted junctions
  const splitSet = new Set<number>([0, last]);
  for (const wp of draft.points) {
    const idx = nearestCoordIndex(coords, wp.lat, wp.lng);
    if (idx > 0 && idx < last) splitSet.add(idx);
  }
  for (const idx of junctionByDraftIdx.keys()) {
    if (idx > 0 && idx < last) splitSet.add(idx);
  }
  const splits = [...splitSet].sort((a, b) => a - b);

  // 3. Resolve nodes per split index (junction nodes take precedence, then 50 m snap, then create)
  const resolveNode = (idx: number): GraphNode => {
    const fromJunction = junctionByDraftIdx.get(idx);
    if (fromJunction) return fromJunction;
    const [lng, lat] = coords[idx];
    const existing = nearestNode(graph, lat, lng, ENDPOINT_SNAP_M);
    if (existing) return existing;
    let label: string | undefined;
    let sif = false;
    if (draft.points.length > 0) {
      let bestD = Infinity;
      for (const wp of draft.points) {
        const d = haversineDistance(wp.lat, wp.lng, lat, lng);
        if (d < bestD) { bestD = d; label = wp.label; sif = wp.showInFinder ?? false; }
      }
    }
    const node: GraphNode = {
      id: uuidv4(), name: label, kind: 'place', lat, lng, showInFinder: sif,
    };
    graph.nodes.push(node);
    return node;
  };

  const resolved = splits.map((idx) => ({ idx, node: resolveNode(idx) }));
  const kept: { idx: number; node: GraphNode }[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const prev = kept[kept.length - 1];
    if (prev && prev.node.id === r.node.id) {
      if (i === resolved.length - 1) prev.idx = r.idx;
      continue;
    }
    kept.push({ ...r });
  }

  // 4. Edges along the draft
  const now = new Date().toISOString();
  const subrouteId = draft.id ?? uuidv4();
  const edgeIds: string[] = [];
  const makeEdge = (slice: Coord[], fromId: string, toId: string) => {
    const edge: GraphSegmentEdge = {
      id: uuidv4(), fromNodeId: fromId, toNodeId: toId,
      geometry: { type: 'LineString', coordinates: slice },
      distance: lineDistance(slice), oneway: false, source: 'drawn', subrouteIds: [subrouteId],
    };
    graph.edges.push(edge);
    edgeIds.push(edge.id);
  };
  if (kept.length === 1) {
    makeEdge(coords.slice(0, last + 1), kept[0].node.id, kept[0].node.id);
  } else {
    for (let i = 0; i < kept.length - 1; i++) {
      makeEdge(coords.slice(kept[i].idx, kept[i + 1].idx + 1), kept[i].node.id, kept[i + 1].node.id);
    }
  }

  const existing = graph.subroutes.find((s) => s.id === draft.id);
  const def: SubRouteDef = {
    ...draft.meta,
    id: subrouteId,
    edgeIds,
    points: draft.points,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  graph.subroutes = graph.subroutes.filter((s) => s.id !== def.id);
  graph.subroutes.push(def);
  return def;
}

/**
 * Remove a sub-route: drop its def; delete its edges unless shared or bridge;
 * drop junction nodes left with degree 0.
 */
export function removeSubroute(graph: GraphData, subrouteId: string): void {
  const def = graph.subroutes.find((s) => s.id === subrouteId);
  if (!def) return;
  graph.subroutes = graph.subroutes.filter((s) => s.id !== subrouteId);

  const removable = new Set<string>();
  for (const id of def.edgeIds) {
    const edge = graph.edges.find((e) => e.id === id);
    if (!edge) continue;
    edge.subrouteIds = edge.subrouteIds.filter((s) => s !== subrouteId);
    if (edge.subrouteIds.length === 0 && edge.source !== 'bridge') removable.add(edge.id);
  }
  graph.edges = graph.edges.filter((e) => !removable.has(e.id));

  const used = new Set<string>();
  for (const e of graph.edges) { used.add(e.fromNodeId); used.add(e.toNodeId); }
  graph.nodes = graph.nodes.filter((n) => used.has(n.id) || n.kind === 'place');
}
