/**
 * Lossless migration: data/routes.json (SavedRoute[]) → data/graph.json (GraphData).
 *
 * Reproduces the admin-authored topology of the legacy finder exactly:
 * split points = sub-route endpoints + every interior named waypoint (the legacy
 * junctionMap was endpoints ∪ all waypoints — its 100 m other-start check only
 * ever selected a subset of waypoints, so waypoint splits are a superset).
 *
 * Guarantees, validated before any write:
 *   concat(edges of sub-route) === original geometry.coordinates  (exact values)
 *   points / meta copied verbatim, same ids.
 *
 * Differences from legacy (intentional, all additive):
 *   - No 400 m short-route skip: every route becomes routable.
 *   - Node snap = 50 m (legacy clustered at 400 m). Node pairs 50–400 m apart
 *     are emitted as connector suggestions for the admin instead of merged.
 *
 * Run: npx tsx scripts/migrate-to-graph.ts [--dry-run] [--force]
 *        [--in data/routes.json] [--out data/graph.json]
 *
 * --in lets you migrate a routes.json fetched from the production server
 * without touching the local file.
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { SavedRoute } from '@/types/routes';
import type { GraphData, GraphNode, GraphSegmentEdge, SubRouteDef, ConnectorSuggestion } from '@/types/graph';
import { haversineDistance } from '@/lib/routing/osrm';
import { nearestCoordIndex } from '@/lib/utils';
import { lineDistance, concatEdgeGeometries, type Coord } from '@/lib/graph/geometry';

const NODE_SNAP_M = 50;
const SUGGEST_MAX_M = 400;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : path.join('data', 'graph.json');
const inIdx = args.indexOf('--in');
const routesPath = inIdx !== -1
  ? path.resolve(args[inIdx + 1])
  : path.join(process.cwd(), 'data', 'routes.json');

const all = JSON.parse(fs.readFileSync(routesPath, 'utf-8')) as SavedRoute[];
const subs = all.filter((r) => (!r.type || r.type === 'sub') && r.geometry && r.geometry.coordinates.length >= 2);
const skipped = all.filter((r) => !subs.includes(r));

// ── Node registry (50 m snap) ─────────────────────────────────────────────────

const nodes: GraphNode[] = [];

function labelOfNearestPoint(route: SavedRoute, lng: number, lat: number): { label: string; sif: boolean } {
  if (route.points.length === 0) return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, sif: false };
  let best = route.points[0];
  let bestD = Infinity;
  for (const pt of route.points) {
    const d = haversineDistance(pt.lat, pt.lng, lat, lng);
    if (d < bestD) { bestD = d; best = pt; }
  }
  return { label: best.label, sif: best.showInFinder ?? false };
}

function addOrGetNode(lat: number, lng: number, name: string, showInFinder: boolean): GraphNode {
  let best: GraphNode | null = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = haversineDistance(n.lat, n.lng, lat, lng);
    if (d < bestD) { bestD = d; best = n; }
  }
  if (best && bestD <= NODE_SNAP_M) {
    if (showInFinder) best.showInFinder = true; // findable once any source marks it findable
    return best;
  }
  const node: GraphNode = { id: uuidv4(), name, kind: 'place', lat, lng, showInFinder };
  nodes.push(node);
  return node;
}

// ── Build edges + subroute defs ───────────────────────────────────────────────

const edges: GraphSegmentEdge[] = [];
const subroutes: SubRouteDef[] = [];

for (const route of subs) {
  const coords = route.geometry!.coordinates as Coord[];
  const last = coords.length - 1;

  // Split indices: endpoints + every interior named waypoint
  const splitSet = new Set<number>([0, last]);
  for (const wp of route.points) {
    const idx = nearestCoordIndex(coords, wp.lat, wp.lng);
    if (idx > 0 && idx < last) splitSet.add(idx);
  }
  const splits = [...splitSet].sort((a, b) => a - b);

  // Resolve a node per split index, then collapse consecutive same-node runs.
  // Keep the FIRST index of each run, except the final run keeps the LAST index
  // (so the tail slice is never dropped) — keeps concat lossless, avoids
  // zero-length edges between clustered splits.
  const resolved = splits.map((idx) => {
    const [lng, lat] = coords[idx];
    const isEndpoint = idx === 0 || idx === last;
    const src = isEndpoint
      ? labelOfNearestPoint(route, lng, lat)
      : (() => {
          // interior split → the waypoint that produced it
          let bestWp = route.points[0];
          let bestD = Infinity;
          for (const wp of route.points) {
            const d = haversineDistance(wp.lat, wp.lng, lat, lng);
            if (d < bestD) { bestD = d; bestWp = wp; }
          }
          return { label: bestWp?.label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`, sif: bestWp?.showInFinder ?? false };
        })();
    return { idx, node: addOrGetNode(lat, lng, src.label, src.sif) };
  });

  const kept: { idx: number; node: GraphNode }[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    const prev = kept[kept.length - 1];
    if (prev && prev.node.id === r.node.id) {
      if (i === resolved.length - 1) prev.idx = r.idx; // final run → keep last index
      continue;
    }
    kept.push({ ...r });
  }

  const edgeIds: string[] = [];
  if (kept.length === 1) {
    // whole route collapses to one node (tiny loop) → single self-loop edge
    const slice = coords.slice(0, last + 1);
    const edge: GraphSegmentEdge = {
      id: uuidv4(), fromNodeId: kept[0].node.id, toNodeId: kept[0].node.id,
      geometry: { type: 'LineString', coordinates: slice },
      distance: lineDistance(slice), oneway: false, source: 'drawn', subrouteIds: [route.id],
    };
    edges.push(edge);
    edgeIds.push(edge.id);
  } else {
    for (let i = 0; i < kept.length - 1; i++) {
      const slice = coords.slice(kept[i].idx, kept[i + 1].idx + 1);
      const edge: GraphSegmentEdge = {
        id: uuidv4(), fromNodeId: kept[i].node.id, toNodeId: kept[i + 1].node.id,
        geometry: { type: 'LineString', coordinates: slice },
        distance: lineDistance(slice), oneway: false, source: 'drawn', subrouteIds: [route.id],
      };
      edges.push(edge);
      edgeIds.push(edge.id);
    }
  }

  subroutes.push({
    id: route.id,
    name: route.name,
    description: route.description,
    color: route.color,
    status: route.status,
    risk_level: route.risk_level,
    travel_mode: route.travel_mode,
    category_id: route.category_id,
    has_checkpost: route.has_checkpost,
    edgeIds,
    points: route.points,
    created_at: route.created_at,
    updated_at: route.updated_at,
  });
}

// ── Connector suggestions (node pairs 50–400 m apart) ────────────────────────

// Only suggest pairs NOT already connected: nodes sharing a sub-route are on the
// same road (consecutive waypoints), and directly-edged pairs need no connector.
const nodeSubs = new Map<string, Set<string>>();
const directPairs = new Set<string>();
for (const e of edges) {
  for (const nid of [e.fromNodeId, e.toNodeId]) {
    if (!nodeSubs.has(nid)) nodeSubs.set(nid, new Set());
    for (const sid of e.subrouteIds) nodeSubs.get(nid)!.add(sid);
  }
  directPairs.add([e.fromNodeId, e.toNodeId].sort().join('|'));
}

const suggestions: ConnectorSuggestion[] = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].id, b = nodes[j].id;
    if (directPairs.has([a, b].sort().join('|'))) continue;
    const subsA = nodeSubs.get(a) ?? new Set();
    const subsB = nodeSubs.get(b) ?? new Set();
    if ([...subsA].some((s) => subsB.has(s))) continue;
    const d = haversineDistance(nodes[i].lat, nodes[i].lng, nodes[j].lat, nodes[j].lng);
    if (d > NODE_SNAP_M && d <= SUGGEST_MAX_M) {
      suggestions.push({
        id: uuidv4(), nodeAId: nodes[i].id, nodeBId: nodes[j].id, distance: Math.round(d),
        note: `${nodes[i].name ?? '?'} ↔ ${nodes[j].name ?? '?'}`,
      });
    }
  }
}

const graph: GraphData = { version: 1, nodes, edges, subroutes, suggestions, updated_at: new Date().toISOString() };

// ── Validation (always runs; write refused unless all pass) ─────────────────

interface Failure { routeId: string; name: string; problem: string; }
const failures: Failure[] = [];
const edgeById = new Map(edges.map((e) => [e.id, e]));
const nodeIds = new Set(nodes.map((n) => n.id));

for (const route of subs) {
  const def = subroutes.find((s) => s.id === route.id)!;
  const orig = route.geometry!.coordinates as Coord[];
  const defEdges = def.edgeIds.map((id) => edgeById.get(id)!);

  const concat = concatEdgeGeometries(defEdges);
  const geomOk = concat.length === orig.length && concat.every((c, i) => c[0] === orig[i][0] && c[1] === orig[i][1]);
  if (!geomOk) failures.push({ routeId: route.id, name: route.name, problem: `geometry mismatch: ${concat.length} vs ${orig.length} coords` });

  if (JSON.stringify(def.points) !== JSON.stringify(route.points)) {
    failures.push({ routeId: route.id, name: route.name, problem: 'points mismatch' });
  }
  for (const key of ['name', 'description', 'color', 'status', 'risk_level', 'travel_mode', 'category_id', 'has_checkpost'] as const) {
    if (def[key] !== route[key]) failures.push({ routeId: route.id, name: route.name, problem: `meta mismatch: ${key}` });
  }
  for (let i = 0; i < defEdges.length; i++) {
    const e = defEdges[i];
    if (!nodeIds.has(e.fromNodeId) || !nodeIds.has(e.toNodeId)) {
      failures.push({ routeId: route.id, name: route.name, problem: `edge ${e.id} references missing node` });
    }
    if (i > 0 && defEdges[i - 1].toNodeId !== e.fromNodeId) {
      failures.push({ routeId: route.id, name: route.name, problem: `edge chain broken at position ${i}` });
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

const pass = subs.length - new Set(failures.map((f) => f.routeId)).size;
console.log(`\nMigration: ${subs.length} sub-routes (${skipped.length} skipped: main/empty-geometry)`);
console.log(`Nodes: ${nodes.length}   Edges: ${edges.length}   Connector suggestions: ${suggestions.length}`);
console.log(`Validation: ${pass}/${subs.length} PASS`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f.name} (${f.routeId}): ${f.problem}`);
}
if (suggestions.length > 0) {
  console.log('\nConnector suggestions (admin resolves via Connector tool):');
  for (const s of suggestions) console.log(`  - ${s.distance} m: ${s.note}`);
}

if (failures.length > 0 && !force) {
  console.error('\nRefusing to write graph.json (use --force to override).');
  process.exit(1);
}
if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

const abs = path.resolve(outPath);
fs.mkdirSync(path.dirname(abs), { recursive: true });
const tmp = `${abs}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(graph, null, 2), 'utf-8');
fs.renameSync(tmp, abs);
console.log(`\nWrote ${outPath}`);
