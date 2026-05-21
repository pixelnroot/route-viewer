import type { SavedRoute } from '@/types/routes';

// Pre-seeded routes around Dhaka, Bangladesh
export const MOCK_ROUTES: SavedRoute[] = [
  {
    id: 'mock-route-1',
    name: 'Gulshan to Motijheel',
    description: 'Main office corridor via Hatirjheel',
    color: '#3b82f6',
    status: 'active',
    risk_level: 'low',
    travel_mode: 'driving',
    points: [
      { id: 'p1-1', label: 'Gulshan 2 Circle', type: 'start', lat: 23.7946, lng: 90.4142, order: 0 },
      { id: 'p1-2', label: 'Hatirjheel Bridge', type: 'waypoint', lat: 23.7723, lng: 90.4071, note: 'Heavy traffic at peak hours', order: 1 },
      { id: 'p1-3', label: 'Karwan Bazar', type: 'poi', lat: 23.7505, lng: 90.3931, note: 'Market stop', order: 2 },
      { id: 'p1-4', label: 'Motijheel Shapla Circle', type: 'destination', lat: 23.7280, lng: 90.4167, order: 3 },
    ],
    geometry: {
      type: 'LineString',
      coordinates: [
        [90.4142, 23.7946], [90.4120, 23.7920], [90.4100, 23.7880],
        [90.4085, 23.7840], [90.4071, 23.7723], [90.4050, 23.7700],
        [90.4010, 23.7650], [90.3970, 23.7600], [90.3931, 23.7505],
        [90.3960, 23.7460], [90.4000, 23.7420], [90.4060, 23.7380],
        [90.4100, 23.7340], [90.4140, 23.7310], [90.4167, 23.7280],
      ],
    },
    created_at: '2026-05-01T08:00:00Z',
    updated_at: '2026-05-01T08:00:00Z',
  },
  {
    id: 'mock-route-2',
    name: 'Airport to Uttara Sector 11',
    description: 'Evacuation route — north corridor',
    color: '#ef4444',
    status: 'active',
    risk_level: 'medium',
    travel_mode: 'driving',
    points: [
      { id: 'p2-1', label: 'Hazrat Shahjalal Airport Gate', type: 'start', lat: 23.8523, lng: 90.4070, order: 0 },
      { id: 'p2-2', label: 'Airport Road Checkpoint', type: 'waypoint', lat: 23.8400, lng: 90.4000, order: 1 },
      { id: 'p2-3', label: 'Uttara Sector 11', type: 'destination', lat: 23.8759, lng: 90.3987, order: 2 },
    ],
    geometry: {
      type: 'LineString',
      coordinates: [
        [90.4070, 23.8523], [90.4050, 23.8490], [90.4030, 23.8450],
        [90.4000, 23.8400], [90.3990, 23.8360], [90.3985, 23.8330],
        [90.3988, 23.8290], [90.3987, 23.8759],
      ],
    },
    created_at: '2026-05-10T10:00:00Z',
    updated_at: '2026-05-10T10:00:00Z',
  },
  {
    id: 'mock-route-3',
    name: 'Old Dhaka Survey Loop',
    description: 'Field data collection circuit — Buriganga riverside',
    color: '#10b981',
    status: 'draft',
    risk_level: 'high',
    travel_mode: 'walking',
    points: [
      { id: 'p3-1', label: 'Sadarghat Launch Terminal', type: 'start', lat: 23.7102, lng: 90.4074, order: 0 },
      { id: 'p3-2', label: 'Ahsan Manzil', type: 'poi', lat: 23.7079, lng: 90.4042, note: 'Pink Palace — landmark', order: 1 },
      { id: 'p3-3', label: 'Chawkbazar', type: 'waypoint', lat: 23.7176, lng: 90.3994, order: 2 },
      { id: 'p3-4', label: 'Sadarghat Launch Terminal', type: 'destination', lat: 23.7102, lng: 90.4074, order: 3 },
    ],
    geometry: {
      type: 'LineString',
      coordinates: [
        [90.4074, 23.7102], [90.4065, 23.7090], [90.4050, 23.7082],
        [90.4042, 23.7079], [90.4030, 23.7090], [90.4015, 23.7110],
        [90.4000, 23.7140], [90.3994, 23.7176], [90.4010, 23.7160],
        [90.4030, 23.7140], [90.4055, 23.7120], [90.4074, 23.7102],
      ],
    },
    created_at: '2026-05-14T07:30:00Z',
    updated_at: '2026-05-14T07:30:00Z',
  },
];
