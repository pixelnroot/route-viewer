import fs from 'fs';
import path from 'path';
import type { GraphData, GraphNode, GraphSegmentEdge, SubRouteDef } from '@/types/graph';
import type { SavedRoute } from '@/types/routes';
import { concatEdgeGeometries, type Coord } from '@/lib/graph/geometry';

// Topology source of truth — swap for PostGIS later (same node/edge model).
const GRAPH_PATH = path.join(process.cwd(), 'data', 'graph.json');

export function emptyGraph(): GraphData {
  return { version: 1, nodes: [], edges: [], subroutes: [], suggestions: [], updated_at: new Date().toISOString() };
}

export function readGraph(): GraphData {
  try {
    const raw = fs.readFileSync(GRAPH_PATH, 'utf-8');
    return JSON.parse(raw) as GraphData;
  } catch {
    return emptyGraph();
  }
}

// Atomic write: temp file + rename, so a crash mid-write can't corrupt topology.
export function writeGraph(graph: GraphData): void {
  graph.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(GRAPH_PATH), { recursive: true });
  const tmp = `${GRAPH_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(graph, null, 2), 'utf-8');
  fs.renameSync(tmp, GRAPH_PATH);
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function getNode(graph: GraphData, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function getEdge(graph: GraphData, id: string): GraphSegmentEdge | undefined {
  return graph.edges.find((e) => e.id === id);
}

export function getSubroute(graph: GraphData, id: string): SubRouteDef | undefined {
  return graph.subroutes.find((s) => s.id === id);
}

export function nodeDegree(graph: GraphData, nodeId: string): number {
  return graph.edges.reduce((n, e) => n + (e.fromNodeId === nodeId || e.toNodeId === nodeId ? 1 : 0), 0);
}

/** Edges of a sub-route in traversal order. Throws on dangling edge ids. */
export function subrouteEdges(graph: GraphData, def: SubRouteDef): GraphSegmentEdge[] {
  const byId = new Map(graph.edges.map((e) => [e.id, e]));
  return def.edgeIds.map((id) => {
    const edge = byId.get(id);
    if (!edge) throw new Error(`Sub-route ${def.id} references missing edge ${id}`);
    return edge;
  });
}

// ── Legacy-shape adapter ──────────────────────────────────────────────────────

/**
 * Reconstruct SavedRoute[] from the graph so existing consumers of
 * /api/routes (MapView, covered page, detail panel) keep working unchanged.
 * Geometry = concatenation of the sub-route's edges (boundary-deduped), which
 * for unedited migrated routes is byte-identical to the original LineString.
 */
export function toSavedRoutes(graph: GraphData): SavedRoute[] {
  return graph.subroutes.map((def) => {
    const { edgeIds, ...meta } = def;
    const coords: Coord[] = concatEdgeGeometries(subrouteEdges(graph, def));
    return {
      ...meta,
      type: 'sub' as const,
      geometry: coords.length >= 2 ? { type: 'LineString' as const, coordinates: coords } : null,
    };
  });
}
