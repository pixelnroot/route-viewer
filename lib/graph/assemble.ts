import { v4 as uuidv4 } from 'uuid';
import type { GraphData, FinderRoute, FinderSegment } from '@/types/graph';
import type { PathStep, PathResult } from './pathfinder';
import type { Coord } from './geometry';

function stepCoords(step: PathStep): Coord[] {
  const coords = step.edge.geometry.coordinates as Coord[];
  return step.forward ? coords : [...coords].reverse();
}

/**
 * Convert a traversal into the FinderRoute shape the map already renders:
 * consecutive drawn edges of the same sub-route collapse into one colored
 * segment; bridge edges become type 'bridge' (drawn dashed/orange).
 */
export function edgePathToFinderRoute(result: PathResult, graph: GraphData): FinderRoute {
  const subrouteById = new Map(graph.subroutes.map((s) => [s.id, s]));

  interface Group { steps: PathStep[]; subrouteId?: string; isBridge: boolean; }
  const groups: Group[] = [];
  for (const step of result.steps) {
    const isBridge = step.edge.source === 'bridge';
    const subrouteId = isBridge ? undefined : step.edge.subrouteIds[0];
    const last = groups[groups.length - 1];
    if (last && last.isBridge === isBridge && last.subrouteId === subrouteId) {
      last.steps.push(step);
    } else {
      groups.push({ steps: [step], subrouteId, isBridge });
    }
  }

  const segments: FinderSegment[] = [];
  const allCoords: Coord[] = [];
  let totalDistance = 0;
  let totalDuration = 0;
  const viaNames: string[] = [];

  for (const group of groups) {
    const coords: Coord[] = [];
    let distance = 0;
    let duration = 0;
    for (const step of group.steps) {
      const sc = stepCoords(step);
      coords.push(...(coords.length === 0 ? sc : sc.slice(1)));
      distance += step.edge.distance;
      duration += step.edge.duration ?? 0;
    }
    allCoords.push(...(allCoords.length === 0 ? coords : coords.slice(1)));
    totalDistance += distance;
    totalDuration += duration;

    if (group.isBridge) {
      segments.push({ type: 'bridge', geometry: { type: 'LineString', coordinates: coords }, distance, duration });
    } else {
      const def = group.subrouteId ? subrouteById.get(group.subrouteId) : undefined;
      if (def && !viaNames.includes(def.name)) viaNames.push(def.name);
      segments.push({
        type: 'subroute',
        geometry: { type: 'LineString', coordinates: coords },
        distance,
        duration,
        subrouteId: def?.id,
        subrouteName: def?.name,
        subrouteColor: def?.color,
      });
    }
  }

  return {
    id: uuidv4(),
    segments,
    totalDistance,
    totalDuration,
    geometry: { type: 'LineString', coordinates: allCoords },
    viaNames,
  };
}
