import { v4 as uuidv4 } from 'uuid';
import type { SavedRoute } from '@/types/routes';
import { haversineDistance } from '@/lib/routing/osrm';
import { nearestCoordIndex } from '@/lib/utils';
import type { NamedLocation, GraphEdge, RouteGraph } from './types';

// 400 m merges nearby Garjania-area nodes (satellite school end is ~315 m from
// Garminia Main Road end) so "গর্জনিয়া বাজার" resolves to the same destination.
const CLUSTER_RADIUS_M = 400;

// Mid-route junctions: only triggers when another sub-route's START endpoint is
// within 100 m of a coord on the host sub-route. Tight threshold avoids false
// positives from parallel roads. 400 m was the old (broken) value.
const JUNCTION_THRESHOLD_M = 100;

function locationId(lat: number, lng: number): string {
  return `${lat.toFixed(5)}_${lng.toFixed(5)}`;
}

function edgeDistance(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversineDistance(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return d;
}

function nearestNode(nodes: Map<string, NamedLocation>, lat: number, lng: number): NamedLocation | null {
  let best: NamedLocation | null = null;
  let bestD = Infinity;
  for (const node of nodes.values()) {
    const d = haversineDistance(node.lat, node.lng, lat, lng);
    if (d < bestD) { bestD = d; best = node; }
  }
  return bestD <= CLUSTER_RADIUS_M ? best : null;
}

function addOrGetNode(
  nodes: Map<string, NamedLocation>,
  lat: number,
  lng: number,
  label: string,
  ref: NamedLocation['subrouteRefs'][number],
  showInFinder: boolean
): string {
  const existing = nearestNode(nodes, lat, lng);
  if (existing) {
    existing.subrouteRefs.push(ref);
    // Once any ref marks this node as findable, it stays findable
    if (showInFinder) existing.showInFinder = true;
    return existing.id;
  }
  const id = locationId(lat, lng);
  nodes.set(id, { id, label, lat, lng, subrouteRefs: [ref], showInFinder });
  return id;
}

// Returns the label of the RoutePoint closest to the given coord
function endpointLabel(route: SavedRoute, coordLng: number, coordLat: number): string {
  if (route.points.length === 0) return `${coordLat.toFixed(4)}, ${coordLng.toFixed(4)}`;
  const sorted = [...route.points].sort((a, b) => a.order - b.order);
  let bestLabel = sorted[0].label;
  let bestD = Infinity;
  for (const pt of sorted) {
    const d = haversineDistance(pt.lat, pt.lng, coordLat, coordLng);
    if (d < bestD) { bestD = d; bestLabel = pt.label; }
  }
  return bestLabel;
}

// Returns showInFinder of the RoutePoint closest to the given coord.
// Defaults false — points are hidden unless admin explicitly enables them.
function endpointShowInFinder(route: SavedRoute, coordLng: number, coordLat: number): boolean {
  if (route.points.length === 0) return false;
  let bestSIF = false;
  let bestD = Infinity;
  for (const pt of route.points) {
    const d = haversineDistance(pt.lat, pt.lng, coordLat, coordLng);
    if (d < bestD) { bestD = d; bestSIF = pt.showInFinder ?? false; }
  }
  return bestSIF;
}

function makeEdges(
  subrouteId: string,
  subrouteName: string,
  subrouteColor: string,
  fromId: string,
  toId: string,
  startIdx: number,
  endIdx: number,
  coords: [number, number][]
): GraphEdge[] {
  const slice = coords.slice(startIdx, endIdx + 1);
  const rev = [...slice].reverse();
  const dist = edgeDistance(slice);
  return [
    { id: uuidv4(), fromId, toId, subrouteId, subrouteName, subrouteColor, startCoordIdx: startIdx, endCoordIdx: endIdx, distance: dist, coordsSlice: slice },
    { id: uuidv4(), fromId: toId, toId: fromId, subrouteId, subrouteName, subrouteColor, startCoordIdx: endIdx, endCoordIdx: startIdx, distance: dist, coordsSlice: rev },
  ];
}

export function buildGraph(subRoutes: SavedRoute[]): RouteGraph {
  const nodes = new Map<string, NamedLocation>();
  const edges: GraphEdge[] = [];

  const valid = subRoutes.filter(
    (r) => (!r.type || r.type === 'sub') && r.geometry && (r.geometry.coordinates as unknown[]).length >= 2
  );

  // Step 1: register each sub-route's start and end as cluster nodes
  for (const route of valid) {
    const coords = route.geometry!.coordinates as [number, number][];
    const startC = coords[0];
    const endC = coords[coords.length - 1];
    if (haversineDistance(startC[1], startC[0], endC[1], endC[0]) < CLUSTER_RADIUS_M) continue;

    addOrGetNode(nodes, startC[1], startC[0], endpointLabel(route, startC[0], startC[1]), {
      subrouteId: route.id, pointType: 'start', coordIdx: 0,
    }, endpointShowInFinder(route, startC[0], startC[1]));

    addOrGetNode(nodes, endC[1], endC[0], endpointLabel(route, endC[0], endC[1]), {
      subrouteId: route.id, pointType: 'destination', coordIdx: coords.length - 1,
    }, endpointShowInFinder(route, endC[0], endC[1]));
  }

  // Step 2: mid-route junction detection at NAMED WAYPOINTS only.
  // The admin marks "dedicated positions" on a sub-route by placing RoutePoints along it.
  // If another sub-route's START endpoint is within JUNCTION_THRESHOLD_M of a named
  // waypoint on the host, the host is split there so the DFS can branch.
  // Checking only RoutePoints (not every coord) avoids false junctions from parallel roads.
  const junctionMap = new Map<string, number[]>();
  for (const route of valid) {
    junctionMap.set(route.id, [0, (route.geometry!.coordinates as unknown[]).length - 1]);
  }

  for (const route of valid) {
    const coords = route.geometry!.coordinates as [number, number][];

    // For each other sub-route, find the SINGLE best waypoint on this route
    // (closest to other's START) and add only one junction per pair.
    // This prevents multiple nearby waypoints from creating multiple junction
    // indices that all resolve to the same cluster node (which causes coord
    // gaps and unwanted bridge segments in the assembled path).
    for (const other of valid) {
      if (other.id === route.id) continue;
      const otherStart = (other.geometry!.coordinates as [number, number][])[0];

      let bestWpIdx = -1;
      let bestDist = JUNCTION_THRESHOLD_M;

      for (const waypoint of route.points) {
        const dist = haversineDistance(waypoint.lat, waypoint.lng, otherStart[1], otherStart[0]);
        if (dist >= bestDist) continue;
        const wpIdx = nearestCoordIndex(coords, waypoint.lat, waypoint.lng);
        if (wpIdx === 0 || wpIdx === coords.length - 1) continue;
        bestDist = dist;
        bestWpIdx = wpIdx;
      }

      if (bestWpIdx === -1) continue;

      addOrGetNode(nodes, otherStart[1], otherStart[0], endpointLabel(other, otherStart[0], otherStart[1]), {
        subrouteId: other.id, pointType: 'start', coordIdx: bestWpIdx,
      }, endpointShowInFinder(other, otherStart[0], otherStart[1]));

      const jList = junctionMap.get(route.id)!;
      if (!jList.includes(bestWpIdx)) jList.push(bestWpIdx);
    }
    junctionMap.get(route.id)!.sort((a, b) => a - b);
  }

  // Step 2b: register ALL named waypoints as graph nodes so they appear in the dropdown.
  // Only waypoints with showInFinder: true (or undefined = backward-compat true) are
  // added as selectable locations; all are still added to junctionMap for edge splitting.
  for (const route of valid) {
    const coords = route.geometry!.coordinates as [number, number][];
    const startC = coords[0];
    const endC = coords[coords.length - 1];
    if (haversineDistance(startC[1], startC[0], endC[1], endC[0]) < CLUSTER_RADIUS_M) continue;

    const jList = junctionMap.get(route.id)!;
    for (const waypoint of route.points) {
      const wpIdx = nearestCoordIndex(coords, waypoint.lat, waypoint.lng);
      if (wpIdx === 0 || wpIdx === coords.length - 1) continue;
      addOrGetNode(nodes, waypoint.lat, waypoint.lng, waypoint.label, {
        subrouteId: route.id, pointType: 'start', coordIdx: wpIdx,
      }, waypoint.showInFinder ?? false);
      if (!jList.includes(wpIdx)) jList.push(wpIdx);
    }
    jList.sort((a, b) => a - b);
  }

  // Step 3: create directed edges between consecutive junction points on each sub-route
  for (const route of valid) {
    const coords = route.geometry!.coordinates as [number, number][];
    const startC = coords[0];
    const endC = coords[coords.length - 1];
    if (haversineDistance(startC[1], startC[0], endC[1], endC[0]) < CLUSTER_RADIUS_M) continue;

    const junctions = junctionMap.get(route.id)!;
    // When multiple consecutive junctions cluster to the same node, carry the
    // earliest coordIdx forward so the next edge's coordsSlice starts from the
    // cluster node position — not from a mid-junction coord 50-100m away that
    // would trigger a spurious bridge segment in assembly.
    let effectiveFromIdx = junctions[0];
    let effectiveFromNode = nearestNode(nodes, coords[junctions[0]][1], coords[junctions[0]][0]);
    for (let j = 0; j < junctions.length - 1; j++) {
      const toIdx = junctions[j + 1];
      const toCoord = coords[toIdx];
      const toNode = nearestNode(nodes, toCoord[1], toCoord[0]);
      if (!effectiveFromNode || !toNode) continue;
      if (effectiveFromNode.id === toNode.id) continue; // same cluster — carry effectiveFrom forward
      edges.push(...makeEdges(route.id, route.name, route.color, effectiveFromNode.id, toNode.id, effectiveFromIdx, toIdx, coords));
      effectiveFromIdx = toIdx;
      effectiveFromNode = toNode;
    }
  }

  const edgesByFrom = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (!edgesByFrom.has(edge.fromId)) edgesByFrom.set(edge.fromId, []);
    edgesByFrom.get(edge.fromId)!.push(edge);
  }

  return { nodes, edges, edgesByFrom };
}
