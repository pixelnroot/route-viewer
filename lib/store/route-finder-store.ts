'use client';

import { create } from 'zustand';
import type { NamedLocation, FinderRoute } from '@/lib/route-finder/types';

interface RouteFinderState {
  finderStartId: string | null;
  finderEndId: string | null;
  finderLocations: NamedLocation[];
  finderResults: FinderRoute[];
  finderActiveIdx: number;
  finderLoading: boolean;
  finderError: string | null;

  setFinderStartId: (id: string | null) => void;
  setFinderEndId: (id: string | null) => void;
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
  finderLocations: [],
  finderResults: [],
  finderActiveIdx: 0,
  finderLoading: false,
  finderError: null,

  setFinderStartId: (id) => set({ finderStartId: id, finderResults: [], finderError: null }),
  setFinderEndId: (id) => set({ finderEndId: id, finderResults: [], finderError: null }),
  setFinderLocations: (locs) => set({ finderLocations: locs }),
  setFinderResults: (routes) => set({ finderResults: routes, finderActiveIdx: 0 }),
  setFinderActiveIdx: (i) => set({ finderActiveIdx: i }),
  setFinderLoading: (v) => set({ finderLoading: v }),
  setFinderError: (e) => set({ finderError: e }),
  resetFinder: () => set({ finderStartId: null, finderEndId: null, finderResults: [], finderActiveIdx: 0, finderError: null }),
}));
