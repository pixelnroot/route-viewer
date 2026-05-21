export type PointType = 'start' | 'waypoint' | 'poi' | 'destination';
export type PoiCategory = 'checkpost' | 'mosque' | 'school' | 'hospital' | 'other';
export type TravelMode = 'driving' | 'walking' | 'cycling';
export type RouteStatus = 'draft' | 'active' | 'archived';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RoutePoint {
  id: string;
  label: string;
  type: PointType;
  category?: PoiCategory;
  lat: number;
  lng: number;
  note?: string;
  imageUrl?: string;
  icon?: string;
  order: number;
}


export interface RouteMeta {
  name: string;
  description?: string;
  color: string;
  status: RouteStatus;
  risk_level: RiskLevel;
  travel_mode: TravelMode;
}

export interface SavedRoute extends RouteMeta {
  id: string;
  points: RoutePoint[];
  geometry: GeoJSON.LineString | null;
  created_at: string;
  updated_at: string;
}

export interface OSRMResponse {
  code: string;
  routes: {
    geometry: GeoJSON.LineString;
    legs: { distance: number; duration: number }[];
    distance: number;
    duration: number;
  }[];
  waypoints: { name: string; location: [number, number] }[];
}
