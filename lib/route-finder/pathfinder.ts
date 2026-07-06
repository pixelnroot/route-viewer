import type { RouteGraph, GraphEdge } from './types';

const MAX_HOPS = 10;
const MAX_PATHS = 50;

// Collapse consecutive partial edges on the same sub-route into one full edge.
// e.g. A(0→50) + A(50→100) + B → A(0→100) + B
function mergeConsecutiveSplits(path: GraphEdge[]): GraphEdge[] {
  const result: GraphEdge[] = [];
  for (const edge of path) {
    const last = result[result.length - 1];
    if (
      last &&
      last.subrouteId === edge.subrouteId &&
      last.endCoordIdx === edge.startCoordIdx
    ) {
      result[result.length - 1] = {
        ...last,
        endCoordIdx: edge.endCoordIdx,
        coordsSlice: [...last.coordsSlice, ...edge.coordsSlice.slice(1)],
        distance: last.distance + edge.distance,
      };
    } else {
      result.push({ ...edge });
    }
  }
  return result;
}

export function findAllPaths(
  graph: RouteGraph,
  startId: string,
  endId: string
): GraphEdge[][] {
  const results: GraphEdge[][] = [];

  function dfs(currentId: string, path: GraphEdge[], visited: Set<string>) {
    if (results.length >= MAX_PATHS) return;
    if (currentId === endId && path.length > 0) {
      results.push([...path]);
      return;
    }
    if (path.length >= MAX_HOPS) return;

    const outgoing = graph.edgesByFrom.get(currentId) ?? [];
    for (const edge of outgoing) {
      if (visited.has(edge.toId)) continue;
      visited.add(edge.toId);
      path.push(edge);
      dfs(edge.toId, path, visited);
      path.pop();
      visited.delete(edge.toId);
    }
  }

  const visited = new Set<string>([startId]);
  dfs(startId, [], visited);

  // Merge junction splits before deduplication so A(0→j)+A(j→n) = A(0→n)
  const merged = results.map(mergeConsecutiveSplits);

  merged.sort((a, b) => {
    const da = a.reduce((s, e) => s + e.distance, 0);
    const db = b.reduce((s, e) => s + e.distance, 0);
    return da - db;
  });

  // Remove paths with any reverse edge (startCoordIdx > endCoordIdx).
  // Reverse traversals produce visual back-and-forth artifacts and are
  // duplicates of the same physical road in forward direction.
  const forwardOnly = merged.filter((path) =>
    path.every((e) => e.startCoordIdx < e.endCoordIdx)
  );

  // Dedup by merged (subrouteId:startIdx-endIdx) sequence
  const seen = new Set<string>();
  return forwardOnly.filter((path) => {
    const key = path.map((e) => `${e.subrouteId}:${e.startCoordIdx}-${e.endCoordIdx}`).join('>');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
