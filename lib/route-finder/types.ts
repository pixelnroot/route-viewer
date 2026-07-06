export interface NamedLocation {
  id: string;
  label: string;
  lat: number;
  lng: number;
  subrouteRefs: Array<{ subrouteId: string; pointType: 'start' | 'destination'; coordIdx: number }>;
  showInFinder: boolean;
}

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  subrouteId: string;
  subrouteName: string;
  subrouteColor: string;
  startCoordIdx: number;
  endCoordIdx: number;
  distance: number;
  coordsSlice: [number, number][];
}

export interface RouteGraph {
  nodes: Map<string, NamedLocation>;
  edges: GraphEdge[];
  edgesByFrom: Map<string, GraphEdge[]>;
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
