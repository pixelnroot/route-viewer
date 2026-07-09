/**
 * Pathfinder smoke test against the migrated graph.
 * Run: npx tsx scripts/dev-pathfind.ts
 */
import { readGraph } from '@/lib/data/graph-db';
import { buildAdjacency, dijkstra, yenKShortest, reachableFrom, insertVirtualNode } from '@/lib/graph/pathfinder';
import { edgePathToFinderRoute } from '@/lib/graph/assemble';

const graph = readGraph();
const adj = buildAdjacency(graph);

const findable = graph.nodes.filter((n) => n.showInFinder);
console.log(`graph: ${graph.nodes.length} nodes (${findable.length} findable), ${graph.edges.length} edges`);

// Pick the two findable nodes with the largest reachable overlap for a demo pair
let failures = 0;

function tryPair(aName: string, bName: string) {
  const a = graph.nodes.find((n) => n.name?.includes(aName) && reachableFrom(adj, n.id).size > 1);
  const b = graph.nodes.find((n) => n.name?.includes(bName) && n.id !== a?.id);
  if (!a || !b) { console.log(`SKIP pair "${aName}" → "${bName}" (node not found)`); return; }

  const fwd = yenKShortest(adj, a.id, b.id, 5);
  const rev = yenKShortest(adj, b.id, a.id, 5);
  console.log(`\n${a.name} → ${b.name}: ${fwd.length} paths ${fwd.length ? `(best ${(fwd[0].distance / 1000).toFixed(1)} km, ${fwd[0].steps.length} steps)` : ''}`);
  console.log(`${b.name} → ${a.name} (REVERSE): ${rev.length} paths ${rev.length ? `(best ${(rev[0].distance / 1000).toFixed(1)} km)` : ''}`);

  if (fwd.length > 0) {
    // shortest-first invariant
    for (let i = 1; i < fwd.length; i++) {
      if (fwd[i].distance < fwd[i - 1].distance - 1e-6) { console.error('  NOT SORTED'); failures++; }
    }
    // reverse must exist if forward exists (all edges two-way)
    if (rev.length === 0) { console.error('  REVERSE MISSING despite two-way edges'); failures++; }
    const route = edgePathToFinderRoute(fwd[0], graph);
    console.log(`  assembled: ${route.segments.length} segments, via ${route.viaNames.join(' → ')}`);
    // geometry continuity
    const g = route.geometry.coordinates;
    if (g.length < 2) { console.error('  DEGENERATE GEOMETRY'); failures++; }
  }
}

// Known area pairs (partial Bangla name match)
tryPair('বাইশারি বাজার', 'গর্জনিয়া');
tryPair('থোয়াঙ্গাকাটা', 'বাইশারি');
tryPair('কোট বাজার', 'ভালুকিয়া');

// Virtual node: snap a point near the middle of the first long edge
const longEdge = [...graph.edges].sort((x, y) => y.geometry.coordinates.length - x.geometry.coordinates.length)[0];
const mid = longEdge.geometry.coordinates[Math.floor(longEdge.geometry.coordinates.length / 2)];
const ins = insertVirtualNode(graph, adj, mid[1] + 0.0005, mid[0] + 0.0005); // ~70m off-road
if (!ins) { console.error('\nVIRTUAL NODE INSERT FAILED'); failures++; }
else {
  const target = findable.find((n) => dijkstra(ins.adj, ins.node.id, n.id));
  console.log(`\nvirtual node snapped onto edge of [${longEdge.subrouteIds[0]}], routable to ${target?.name ?? 'NOTHING'}`);
  if (!target) failures++;
}

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
