export type PointType = 'start' | 'waypoint' | 'poi' | 'destination';
export type PoiCategory = 'checkpost' | 'mosque' | 'school' | 'hospital' | 'other';
export type TravelMode = 'driving' | 'walking' | 'cycling';
export type RouteStatus = 'draft' | 'active' | 'archived';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Category {
  id: string;
  name: string;
  color: string;
  description?: string;
}

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
  segmentMode?: 'auto' | 'direct'; // routing from this point TO the next
  position_after?: string;          // for direct waypoints on main routes: 'start' | sub-route-id | undefined (= end)
}


export interface RouteMeta {
  name: string;
  description?: string;
  color: string;
  status: RouteStatus;
  risk_level: RiskLevel;
  travel_mode: TravelMode;
  category_id?: string;
}

export type RouteType = 'sub' | 'main';

export interface SavedRoute extends RouteMeta {
  id: string;
  type?: RouteType;           // undefined = backward-compat sub-route
  sub_route_ids?: string[];   // ordered; only on main routes
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
