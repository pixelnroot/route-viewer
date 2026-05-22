'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type { RoutePoint, RouteMeta, SavedRoute, PointType, Category } from '@/types/routes';

type AppMode = 'view' | 'create';
type BuilderTool = 'draw_path' | 'add_poi';

interface RouteBuilderState {
  // app mode
  mode: AppMode;
  builderTool: BuilderTool;

  // builder state
  points: RoutePoint[];
  meta: Partial<RouteMeta>;
  generatedGeometry: GeoJSON.LineString | null;
  generatedDistance: number | null;
  generatedDuration: number | null;
  isGenerating: boolean;
  generateError: string | null;

  // saved routes
  savedRoutes: SavedRoute[];
  selectedRouteId: string | null;

  // edit mode
  editingRouteId: string | null;
  loadRouteForEdit: (route: SavedRoute) => void;

  // map fly-to trigger
  pendingFlyTo: { lat: number; lng: number } | null;
  flyTo: (lat: number, lng: number) => void;
  clearFlyTo: () => void;

  // map click location info (view mode)
  clickedCoord: { lat: number; lng: number } | null;
  setClickedCoord: (coord: { lat: number; lng: number } | null) => void;

  // fallback flag
  routeIsFallback: boolean;

  // categories
  categories: Category[];
  categoryFilter: string | null;
  setCategories: (cats: Category[]) => void;
  addCategory: (cat: Category) => void;
  updateCategory: (cat: Category) => void;
  removeCategory: (id: string) => void;
  setCategoryFilter: (id: string | null) => void;

  // checkpost visibility (affects both detail panel list AND map markers)
  showCheckposts: boolean;
  setShowCheckposts: (v: boolean) => void;

  // mode actions
  setMode: (mode: AppMode) => void;
  setBuilderTool: (tool: BuilderTool) => void;

  // point actions
  addPoint: (point: Omit<RoutePoint, 'id' | 'order'>) => void;
  addPointAtLatLng: (lat: number, lng: number) => void;
  updatePoint: (id: string, patch: Partial<RoutePoint>) => void;
  removePoint: (id: string) => void;
  reorderPoints: (orderedIds: string[]) => void;

  // meta actions
  setMeta: (patch: Partial<RouteMeta>) => void;

  // generation actions
  setGeneratedGeometry: (
    geometry: GeoJSON.LineString | null,
    distance?: number,
    duration?: number,
    isFallback?: boolean,
  ) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerateError: (err: string | null) => void;

  // saved route actions
  setSavedRoutes: (routes: SavedRoute[]) => void;
  addSavedRoute: (route: SavedRoute) => void;
  updateSavedRoute: (route: SavedRoute) => void;
  removeSavedRoute: (id: string) => void;
  selectRoute: (id: string | null) => void;

  // reset builder
  resetBuilder: () => void;
}

const DEFAULT_META: Partial<RouteMeta> = {
  name: '',
  description: '',
  color: '#3b82f6',
  status: 'draft',
  risk_level: 'low',
  travel_mode: 'driving',
};

function nextPointType(points: RoutePoint[]): PointType {
  if (points.length === 0) return 'start';
  return 'waypoint';
}

export const useRouteBuilderStore = create<RouteBuilderState>()(
  persist(
    (set, get) => ({
      mode: 'view',
      builderTool: 'draw_path',
      points: [],
      meta: { ...DEFAULT_META },
      generatedGeometry: null,
      generatedDistance: null,
      generatedDuration: null,
      isGenerating: false,
      generateError: null,
      savedRoutes: [],
      selectedRouteId: null,
      editingRouteId: null,
      categories: [],
      categoryFilter: null,
      showCheckposts: true,
      pendingFlyTo: null,
      routeIsFallback: false,
      clickedCoord: null,

      setMode: (mode) => set({ mode }),
      setBuilderTool: (tool) => set({ builderTool: tool }),

      flyTo: (lat, lng) => set({ pendingFlyTo: { lat, lng } }),
      clearFlyTo: () => set({ pendingFlyTo: null }),
      setClickedCoord: (coord) => set({ clickedCoord: coord }),

      loadRouteForEdit: (route) =>
        set({
          mode: 'create',
          editingRouteId: route.id,
          points: route.points,
          meta: {
            name: route.name,
            description: route.description,
            color: route.color,
            status: route.status,
            risk_level: route.risk_level,
            travel_mode: route.travel_mode,
            category_id: route.category_id,
          },
          generatedGeometry: route.geometry ?? null,
          generatedDistance: null,
          generatedDuration: null,
          routeIsFallback: false,
          generateError: null,
          builderTool: 'draw_path',
        }),

      addPoint: (point) =>
        set((s) => {
          const order = s.points.length;
          return {
            points: [...s.points, { ...point, id: uuidv4(), order }],
            generatedGeometry: null,
          };
        }),

      addPointAtLatLng: (lat, lng) => {
        const { points, addPoint, builderTool } = get();
        
        if (builderTool === 'add_poi') {
          addPoint({ label: 'New Checkpost', type: 'poi', lat, lng, category: 'checkpost' });
          return;
        }

        const type = nextPointType(points.filter(p => p.type !== 'poi'));
        const pathPoints = points.filter(p => p.type !== 'poi').length;
        const label =
          type === 'start'
            ? 'Start'
            : type === 'destination'
            ? 'Destination'
            : `Waypoint ${pathPoints}`;
        addPoint({ label, type, lat, lng });
      },

      updatePoint: (id, patch) =>
        set((s) => ({
          points: s.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          generatedGeometry: null,
        })),

      removePoint: (id) =>
        set((s) => {
          const filtered = s.points
            .filter((p) => p.id !== id)
            .map((p, i) => ({ ...p, order: i }));
          return { points: filtered, generatedGeometry: null };
        }),

      reorderPoints: (orderedIds) =>
        set((s) => {
          const map = new Map(s.points.map((p) => [p.id, p]));
          const reordered = orderedIds
            .map((id, i) => {
              const p = map.get(id);
              return p ? { ...p, order: i } : null;
            })
            .filter(Boolean) as RoutePoint[];
          return { points: reordered, generatedGeometry: null };
        }),

      setMeta: (patch) =>
        set((s) => ({ meta: { ...s.meta, ...patch } })),

      setGeneratedGeometry: (geometry, distance, duration, isFallback) =>
        set({
          generatedGeometry: geometry,
          generatedDistance: distance ?? null,
          generatedDuration: duration ?? null,
          routeIsFallback: isFallback ?? false,
        }),

      setIsGenerating: (v) => set({ isGenerating: v }),

      setGenerateError: (err) => set({ generateError: err }),

      setShowCheckposts: (v) => set({ showCheckposts: v }),
      setCategories: (cats) => set({ categories: cats }),
      addCategory: (cat) => set((s) => ({ categories: [...s.categories, cat] })),
      updateCategory: (cat) =>
        set((s) => ({ categories: s.categories.map((c) => (c.id === cat.id ? cat : c)) })),
      removeCategory: (id) =>
        set((s) => ({ categories: s.categories.filter((c) => c.id !== id) })),
      setCategoryFilter: (id) => set({ categoryFilter: id }),

      setSavedRoutes: (routes) => set({ savedRoutes: routes }),

      addSavedRoute: (route) =>
        set((s) => ({ savedRoutes: [route, ...s.savedRoutes] })),

      updateSavedRoute: (route) =>
        set((s) => ({
          savedRoutes: s.savedRoutes.map((r) => (r.id === route.id ? route : r)),
        })),

      removeSavedRoute: (id) =>
        set((s) => ({ savedRoutes: s.savedRoutes.filter((r) => r.id !== id) })),

      selectRoute: (id) => set({ selectedRouteId: id, mode: 'view' }),

      resetBuilder: () =>
        set({
          points: [],
          meta: { ...DEFAULT_META },
          generatedGeometry: null,
          generatedDistance: null,
          generatedDuration: null,
          isGenerating: false,
          generateError: null,
          builderTool: 'draw_path',
          routeIsFallback: false,
          pendingFlyTo: null,
          editingRouteId: null,
        }),
    }),
    {
      name: 'field-data-routes',
      partialize: (s) => ({ savedRoutes: s.savedRoutes }),
    }
  )
);
