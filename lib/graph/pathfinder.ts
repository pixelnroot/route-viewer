import { v4 as uuidv4 } from 'uuid';
import type { GraphData, GraphNode, GraphSegmentEdge } from '@/types/graph';
import { bbox, bboxesOverlap, nearestPointOnPolyline, splitLineAt, lineDistance, type Coord } from './geometry';

/** One traversal step: an edge walked forward (from→to) or backward (to→from). */
export interface PathStep {
  edge: GraphSegmentEdge;
  forward: boolean;
}

interface AdjEntry {
  edge: GraphSegmentEdge;
  forward: boolean;
  toNodeId: string;
}

export type Adjacency = Map<string, AdjEntry[]>;

export function buildAdjacency(graph: GraphData): Adjacency {
  const adj: Adjacency = new Map();
  const push = (nodeId: string, entry: AdjEntry) => {
    if (!adj.has(nodeId)) adj.set(nodeId, []);
    adj.get(nodeId)!.push(entry);
  };
  for (const edge of graph.edges) {
    if (edge.fromNodeId === edge.toNodeId) continue; // self-loops never improve a path
    push(edge.fromNodeId, { edge, forward: true, toNodeId: edge.toNodeId });
    if (!edge.oneway) push(edge.toNodeId, { edge, forward: false, toNodeId: edge.fromNodeId });
  }
  return adj;
}

// ── Dijkstra with removal sets (for Yen's spur computations) ─────────────────

interface HeapItem { nodeId: string; dist: number; }

class MinHeap {
  private items: HeapItem[] = [];
  get size() { return this.items.length; }
  push(item: HeapItem) {
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].dist <= this.items[i].dist) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let m = i;
        if (l < this.items.length && this.items[l].dist < this.items[m].dist) m = l;
        if (r < this.items.length && this.items[r].dist < this.items[m].dist) m = r;
        if (m === i) break;
        [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
        i = m;
      }
    }
    return top;
  }
}

export interface PathResult {
  steps: PathStep[];
  distance: number;
}

export function dijkstra(
  adj: Adjacency,
  startId: string,
  endId: string,
  removed?: { edges?: Set<string>; nodes?: Set<string> }
): PathResult | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, { nodeId: string; step: PathStep }>();
  const done = new Set<string>();
  const heap = new MinHeap();

  dist.set(startId, 0);
  heap.push({ nodeId: startId, dist: 0 });

  while (heap.size > 0) {
    const { nodeId, dist: d } = heap.pop()!;
    if (done.has(nodeId)) continue;
    done.add(nodeId);
    if (nodeId === endId) break;

    for (const entry of adj.get(nodeId) ?? []) {
      if (removed?.edges?.has(entry.edge.id)) continue;
      if (removed?.nodes?.has(entry.toNodeId)) continue;
      const nd = d + entry.edge.distance;
      if (nd < (dist.get(entry.toNodeId) ?? Infinity)) {
        dist.set(entry.toNodeId, nd);
        prev.set(entry.toNodeId, { nodeId, step: { edge: entry.edge, forward: entry.forward } });
        heap.push({ nodeId: entry.toNodeId, dist: nd });
      }
    }
  }

  if (!dist.has(endId) || !done.has(endId)) return null;

  const steps: PathStep[] = [];
  let curr = endId;
  while (curr !== startId) {
    const p = prev.get(curr);
    if (!p) return null;
    steps.unshift(p.step);
    curr = p.nodeId;
  }
  return { steps, distance: dist.get(endId)! };
}

// ── Yen's K-shortest loopless paths ───────────────────────────────────────────

function pathNodes(startId: string, steps: PathStep[]): string[] {
  const out = [startId];
  for (const s of steps) out.push(s.forward ? s.edge.toNodeId : s.edge.fromNodeId);
  return out;
}

function pathKey(steps: PathStep[]): string {
  return steps.map((s) => `${s.edge.id}:${s.forward ? 'f' : 'b'}`).join('>');
}

export function yenKShortest(adj: Adjacency, startId: string, endId: string, K = 8): PathResult[] {
  const best = dijkstra(adj, startId, endId);
  if (!best) return [];

  const results: PathResult[] = [best];
  const seen = new Set<string>([pathKey(best.steps)]);
  const candidates: PathResult[] = [];

  for (let k = 1; k < K; k++) {
    const prevPath = results[k - 1];
    const prevNodes = pathNodes(startId, prevPath.steps);

    for (let i = 0; i < prevPath.steps.length; i++) {
      const spurNode = prevNodes[i];
      const rootSteps = prevPath.steps.slice(0, i);
      const rootDist = rootSteps.reduce((s, st) => s + st.edge.distance, 0);

      // Remove edges that would recreate any already-found path with this root
      const removedEdges = new Set<string>();
      const rootK = pathKey(rootSteps);
      for (const r of results) {
        if (pathKey(r.steps.slice(0, i)) === rootK && r.steps[i]) {
          removedEdges.add(r.steps[i].edge.id);
        }
      }
      // Loopless: block root nodes (except spur node)
      const removedNodes = new Set(prevNodes.slice(0, i));

      const spur = dijkstra(adj, spurNode, endId, { edges: removedEdges, nodes: removedNodes });
      if (!spur) continue;

      const total: PathResult = {
        steps: [...rootSteps, ...spur.steps],
        distance: rootDist + spur.distance,
      };
      const key = pathKey(total.steps);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(total);
      }
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.distance - b.distance);
    results.push(candidates.shift()!);
  }

  return results;
}

// ── Reachability (finder destination dropdown filter) ────────────────────────

export function reachableFrom(adj: Adjacency, startId: string): Set<string> {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const entry of adj.get(curr) ?? []) {
      if (!visited.has(entry.toNodeId)) {
        visited.add(entry.toNodeId);
        queue.push(entry.toNodeId);
      }
    }
  }
  return visited;
}

// ── Virtual nodes: route from/to any position on any edge ────────────────────

export interface VirtualInsertion {
  node: GraphNode;
  adj: Adjacency; // copy of input adjacency with the split applied
}

/**
 * Snap (lat, lng) to the nearest edge (≤ maxSnapM) and split that edge
 * in-memory into two half-edges joined at a synthetic node. The stored graph
 * is untouched; the returned adjacency is a shallow copy with the split.
 * Half-edges keep the host edge's subrouteIds so display attribution survives.
 */
export function insertVirtualNode(
  graph: GraphData,
  adj: Adjacency,
  lat: number,
  lng: number,
  maxSnapM = 500
): VirtualInsertion | null {
  const queryBox = bbox([[lng, lat]]);
  let bestEdge: GraphSegmentEdge | null = null;
  let bestProj: ReturnType<typeof nearestPointOnPolyline> | null = null;

  for (const edge of graph.edges) {
    const coords = edge.geometry.coordinates as Coord[];
    if (!bboxesOverlap(bbox(coords), queryBox, maxSnapM)) continue;
    const proj = nearestPointOnPolyline(coords, lat, lng);
    if (proj.distM <= maxSnapM && (!bestProj || proj.distM < bestProj.distM)) {
      bestEdge = edge;
      bestProj = proj;
    }
  }
  if (!bestEdge || !bestProj) return null;

  // Snapped onto the edge's terminal vertex → reuse the real node, no split
  const coords = bestEdge.geometry.coordinates as Coord[];
  const atStart = bestProj.segIdx === 0 && bestProj.t <= 1e-9;
  const atEnd = bestProj.segIdx === coords.length - 2 && bestProj.t >= 1 - 1e-9;
  if (atStart || atEnd) {
    const existing = graph.nodes.find((n) => n.id === (atStart ? bestEdge!.fromNodeId : bestEdge!.toNodeId));
    if (existing) return { node: existing, adj };
  }

  const node: GraphNode = {
    id: `virtual:${uuidv4()}`,
    name: undefined,
    kind: 'junction',
    lat: bestProj.lat,
    lng: bestProj.lng,
    showInFinder: false,
  };

  const [coordsA, coordsB] = splitLineAt(bestEdge.geometry.coordinates as Coord[], bestProj.segIdx, bestProj.t);
  const halfA: GraphSegmentEdge = {
    ...bestEdge,
    id: `virtual:${uuidv4()}`,
    toNodeId: node.id,
    geometry: { type: 'LineString', coordinates: coordsA },
    distance: lineDistance(coordsA),
  };
  const halfB: GraphSegmentEdge = {
    ...bestEdge,
    id: `virtual:${uuidv4()}`,
    fromNodeId: node.id,
    geometry: { type: 'LineString', coordinates: coordsB },
    distance: lineDistance(coordsB),
  };

  // Shallow-copy adjacency, drop the host edge's entries, add the halves
  const next: Adjacency = new Map();
  for (const [nodeId, entries] of adj) {
    next.set(nodeId, entries.filter((e) => e.edge.id !== bestEdge!.id));
  }
  const push = (nodeId: string, entry: AdjEntry) => {
    if (!next.has(nodeId)) next.set(nodeId, []);
    next.get(nodeId)!.push(entry);
  };
  for (const half of [halfA, halfB]) {
    if (half.geometry.coordinates.length < 2 || half.distance === 0) continue; // degenerate: snapped onto an existing node
    push(half.fromNodeId, { edge: half, forward: true, toNodeId: half.toNodeId });
    if (!half.oneway) push(half.toNodeId, { edge: half, forward: false, toNodeId: half.fromNodeId });
  }

  return { node, adj: next };
}
