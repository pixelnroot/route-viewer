'use client';

import { create } from 'zustand';
import type { NamedLocation, FinderRoute } from '@/types/graph';

export interface FinderPoint { lat: number; lng: number; }

interface RouteFinderState {
  finderStartId: string | null;
  finderEndId: string | null;
  /** arbitrary map-picked positions — mutually exclusive with the id fields */
  finderStartPoint: FinderPoint | null;
  finderEndPoint: FinderPoint | null;
  /** which endpoint the next map click fills, if any */
  finderPickTarget: 'start' | 'end' | null;
  finderLocations: NamedLocation[];
  finderResults: FinderRoute[];
  finderActiveIdx: number;
  finderLoading: boolean;
  finderError: string | null;

  setFinderStartId: (id: string | null) => void;
  setFinderEndId: (id: string | null) => void;
  setFinderStartPoint: (p: FinderPoint | null) => void;
  setFinderEndPoint: (p: FinderPoint | null) => void;
  setFinderPickTarget: (t: 'start' | 'end' | null) => void;
  setFinderLocations: (locs: NamedLocation[]) => void;
  setFinderResults: (routes: FinderRoute[]) => void;
  setFinderActiveIdx: (i: number) => void;
  setFinderLoading: (v: boolean) => void;
  setFinderError: (e: string | null) => void;
  resetFinder: () => void;
}

export const useRouteFinderStore = create<RouteFinderState>()((set) => ({
  finderStartId: null,
  finderEndId: null,
  finderStartPoint: null,
  finderEndPoint: null,
  finderPickTarget: null,
  finderLocations: [],
  finderResults: [],
  finderActiveIdx: 0,
  finderLoading: false,
  finderError: null,

  setFinderStartId: (id) => set({ finderStartId: id, finderStartPoint: null, finderResults: [], finderError: null }),
  setFinderEndId: (id) => set({ finderEndId: id, finderEndPoint: null, finderResults: [], finderError: null }),
  setFinderStartPoint: (p) => set({ finderStartPoint: p, finderStartId: null, finderPickTarget: null, finderResults: [], finderError: null }),
  setFinderEndPoint: (p) => set({ finderEndPoint: p, finderEndId: null, finderPickTarget: null, finderResults: [], finderError: null }),
  setFinderPickTarget: (t) => set({ finderPickTarget: t }),
  setFinderLocations: (locs) => set({ finderLocations: locs }),
  setFinderResults: (routes) => set({ finderResults: routes, finderActiveIdx: 0 }),
  setFinderActiveIdx: (i) => set({ finderActiveIdx: i }),
  setFinderLoading: (v) => set({ finderLoading: v }),
  setFinderError: (e) => set({ finderError: e }),
  resetFinder: () => set({
    finderStartId: null, finderEndId: null,
    finderStartPoint: null, finderEndPoint: null, finderPickTarget: null,
    finderResults: [], finderActiveIdx: 0, finderError: null,
  }),
}));
