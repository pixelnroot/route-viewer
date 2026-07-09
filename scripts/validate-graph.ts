/**
 * Standalone graph invariant checker. Run after any admin topology operation
 * during development: npx tsx scripts/validate-graph.ts
 */
import { readGraph } from '@/lib/data/graph-db';

const graph = readGraph();
const problems: string[] = [];

const nodeIds = new Set(graph.nodes.map((n) => n.id));
const edgeIds = new Set(graph.edges.map((e) => e.id));

if (nodeIds.size !== graph.nodes.length) problems.push('duplicate node ids');
if (edgeIds.size !== graph.edges.length) problems.push('duplicate edge ids');

for (const n of graph.nodes) {
  if (!Number.isFinite(n.lat) || !Number.isFinite(n.lng)) problems.push(`node ${n.id} has non-finite coords`);
}

const referencedNodes = new Set<string>();
for (const e of graph.edges) {
  if (!nodeIds.has(e.fromNodeId)) problems.push(`edge ${e.id} fromNodeId missing`);
  if (!nodeIds.has(e.toNodeId)) problems.push(`edge ${e.id} toNodeId missing`);
  referencedNodes.add(e.fromNodeId);
  referencedNodes.add(e.toNodeId);
  const coords = e.geometry.coordinates;
  if (coords.length < 2) problems.push(`edge ${e.id} has ${coords.length} coords`);
  for (const c of coords) {
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) { problems.push(`edge ${e.id} has non-finite coord`); break; }
  }
  if (e.distance < 0 || !Number.isFinite(e.distance)) problems.push(`edge ${e.id} bad distance`);
}

const usedEdges = new Set<string>();
for (const def of graph.subroutes) {
  for (let i = 0; i < def.edgeIds.length; i++) {
    const id = def.edgeIds[i];
    if (!edgeIds.has(id)) { problems.push(`subroute ${def.name} references missing edge ${id}`); continue; }
    usedEdges.add(id);
    if (i > 0) {
      const prev = graph.edges.find((e) => e.id === def.edgeIds[i - 1])!;
      const curr = graph.edges.find((e) => e.id === id)!;
      if (prev.toNodeId !== curr.fromNodeId) problems.push(`subroute ${def.name} edge chain broken at ${i}`);
    }
  }
}

for (const e of graph.edges) {
  if (e.source === 'drawn' && !usedEdges.has(e.id)) problems.push(`drawn edge ${e.id} not referenced by any subroute`);
  for (const sid of e.subrouteIds) {
    if (!graph.subroutes.some((s) => s.id === sid)) problems.push(`edge ${e.id} lists missing subroute ${sid}`);
  }
}

const orphans = graph.nodes.filter((n) => !referencedNodes.has(n.id));

console.log(`nodes=${graph.nodes.length} edges=${graph.edges.length} subroutes=${graph.subroutes.length} suggestions=${graph.suggestions.length}`);
if (orphans.length > 0) console.log(`orphan nodes (degree 0): ${orphans.map((n) => n.name ?? n.id).join(', ')}`);
if (problems.length === 0) {
  console.log('OK — all invariants hold.');
} else {
  console.error(`${problems.length} PROBLEMS:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
