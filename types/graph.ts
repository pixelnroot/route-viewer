import type { RouteMeta, RoutePoint } from './routes';

/**
 * Topology-first graph model.
 *
 * - GraphNode: places and junctions. The only selectable/joinable positions.
 * - GraphSegmentEdge: atomic road piece between two nodes. The ONLY routing unit.
 * - SubRouteDef: presentation-only named overlay — an ordered list of edges plus
 *   POIs and meta. Never consulted by the pathfinder.
 */

export interface GraphNode {
  id: string;
  name?: string;
  kind: 'place' | 'junction';
  lat: number;
  lng: number;
  showInFinder: boolean;
}

export interface GraphSegmentEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  geometry: GeoJSON.LineString;
  distance: number;      // meters
  duration?: number;     // seconds; only bridge edges carry this
  oneway: boolean;       // false = traversable both directions
  source: 'drawn' | 'bridge';
  subrouteIds: string[]; // sub-routes this edge belongs to (display attribution)
}

export interface SubRouteDef extends RouteMeta {
  id: string;
  edgeIds: string[];     // ordered along the sub-route's forward direction
  points: RoutePoint[];
  created_at: string;
  updated_at: string;
}

/** Node pair 50–400 m apart that the legacy finder used to merge/bridge; admin resolves via Connector tool. */
export interface ConnectorSuggestion {
  id: string;
  nodeAId: string;
  nodeBId: string;
  distance: number;      // meters
  note?: string;
}

export interface GraphData {
  version: 1;
  nodes: GraphNode[];
  edges: GraphSegmentEdge[];
  subroutes: SubRouteDef[];
  suggestions: ConnectorSuggestion[];
  updated_at: string;
}

// ── Finder output shapes (kept identical to the legacy finder so MapView /
//    RouteFinderPanel / route-finder-store render unchanged) ──────────────────

export interface NamedLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  subrouteRefs: Array<{ subrouteId: string; pointType: 'start' | 'destination'; coordIdx: number }>;
  showInFinder: boolean;
}

export interface FinderSegment {
  type: 'subroute' | 'bridge';
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
  subrouteId?: string;
  subrouteName?: string;
  subrouteColor?: string;
  startIdx?: number;
  endIdx?: number;
}

export interface FinderRoute {
  id: string;
  segments: FinderSegment[];
  totalDistance: number;
  totalDuration: number;
  geometry: GeoJSON.LineString;
  viaNames: string[];
}
