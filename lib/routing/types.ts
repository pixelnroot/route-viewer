import type { TravelMode } from '@/types/routes';

export interface RoutingOptions {
  mode: TravelMode;
  overview?: 'full' | 'simplified' | 'false';
}

export interface RoutingResult {
  geometry: GeoJSON.LineString;
  distance: number;   // metres
  duration: number;   // seconds
}

export type RoutingEngine = 'osrm' | 'graphhopper' | 'valhalla';
