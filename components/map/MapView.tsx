'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Layers } from 'lucide-react';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useRouteFinderStore } from '@/lib/store/route-finder-store';
import { useGraphStore } from '@/lib/store/graph-store';
import { Button } from '@/components/ui/button';
import type { PointType, RoutePoint, SavedRoute } from '@/types/routes';
import { nearestCoordIndex } from '@/lib/utils';

// Called once at module level — avoids "setOptions called multiple times" warning in StrictMode
setOptions({
  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  v: 'weekly',
});

const INITIAL_CENTER = { lat: 23.7937, lng: 90.4125 };
const INITIAL_ZOOM = 12;

const POINT_COLORS: Record<PointType, string> = {
  start: '#22c55e',
  waypoint: '#3b82f6',
  poi: '#eab308',
  destination: '#ef4444',
};

const POINT_LETTER: Record<PointType, string> = {
  start: 'S',
  waypoint: 'W',
  poi: 'P',
  destination: 'D',
};

const CATEGORY_LETTER: Record<string, string> = {
  checkpost: 'CP',
  mosque: 'MO',
  school: 'SC',
  hospital: 'H',
  other: 'P',
};

const CATEGORY_COLOR: Record<string, string> = {
  checkpost: '#ef4444',
  mosque: '#8b5cf6',
  school: '#06b6d4',
  hospital: '#f97316',
  other: '#eab308',
};

// Classic Google Maps-style location pin: large circle head + teardrop tail + white hole
// Canvas angle note (Y-axis DOWN): 0=right, 90=DOWN, 180=left, 270=UP
// 60° = lower-right of circle, 120° = lower-left of circle
// Arc clockwise from 120° to 60° = sweeps over the top (300° of circle = the head)
function createLocationPin(color: string, W = 32, H = 48): string {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const cx = W / 2;
  const r = cx - 1;
  const cy = r + 1;

  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;

  ctx.beginPath();
  // Clockwise (anticlockwise=false) from 120° to 60° sweeps the LONG way over the top (300° arc)
  ctx.arc(cx, cy, r, (2 * Math.PI) / 3, Math.PI / 3, false);
  // Arc ends at 60° (lower-right of circle) → line to tip
  ctx.lineTo(cx, H - 2);
  // closePath draws line from tip back to 120° point (lower-left of circle)
  ctx.closePath();
  ctx.fill();

  // White inner hole
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();

  return canvas.toDataURL('image/png');
}

// Small filled circle for waypoints
function createCirclePng(color: string, label: string, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const h = size / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(h, h, h - 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'white';
  ctx.font = `900 ${Math.floor(size * 0.42)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, h, h);
  return canvas.toDataURL('image/png');
}

function getMarkerIcon(point: RoutePoint, _size: number): google.maps.Icon {
  const sizes: Record<PointType, number> = { start: 32, destination: 32, poi: 28, waypoint: 22 };
  const s = sizes[point.type];
  const color = point.type === 'poi' && point.category
    ? (CATEGORY_COLOR[point.category] ?? POINT_COLORS.poi)
    : POINT_COLORS[point.type];
  const label = point.type === 'poi' && point.category
    ? (CATEGORY_LETTER[point.category] ?? 'P')
    : POINT_LETTER[point.type];
  return {
    url: createCirclePng(color, label, s),
    scaledSize: new google.maps.Size(s, s),
    anchor: new google.maps.Point(s / 2, s / 2),
  };
}

function getPinIcon(color: string): google.maps.Icon {
  return {
    url: createLocationPin(color, 32, 48),
    scaledSize: new google.maps.Size(32, 48),
    anchor: new google.maps.Point(16, 46),
  };
}

function getPopupHTML(point: RoutePoint): string {
  return `<div style="padding:4px 2px;max-width:260px;font-family:sans-serif;">
    <h3 style="font-weight:600;font-size:14px;margin:0 0 4px 0;line-height:1.3;">${point.label}</h3>
    <p style="font-size:11px;color:#888;margin:0 0 ${point.imageUrl || point.note ? '6px' : '0'} 0;font-family:monospace;">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</p>
    ${point.imageUrl ? `<img src="${point.imageUrl}" alt="${point.label}" style="width:100%;height:auto;border-radius:6px;margin-bottom:6px;object-fit:cover;display:block;"/>` : ''}
    ${point.note ? `<p style="font-size:12px;line-height:1.5;margin:0;color:#444;">${point.note}</p>` : ''}
  </div>`;
}

function hasPopupContent(_point: RoutePoint): boolean {
  return true;
}

type MapType = 'roadmap' | 'satellite' | 'terrain';

function getDisplayGeometry(route: SavedRoute, _allRoutes: SavedRoute[]): GeoJSON.LineString | null {
  return route.geometry ?? null;
}

function routeHasPoi(route: SavedRoute, allRoutes: SavedRoute[]): boolean {
  if (route.type === 'main') {
    return (route.sub_route_ids ?? []).some((id) => {
      const sub = allRoutes.find((r) => r.id === id);
      return sub?.points.some((p) => p.type === 'poi') ?? false;
    });
  }
  return route.points.some((p) => p.type === 'poi');
}

function ptDistM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function isBoundaryDuplicate(a: RoutePoint, b: RoutePoint): boolean {
  return a.label.toLowerCase() === b.label.toLowerCase() || ptDistM(a, b) < 20;
}

// Point-to-segment distance check in meters (equirectangular approximation)
function isNearGeometry(lat: number, lng: number, geo: GeoJSON.LineString, threshMeters = 50): boolean {
  const toRad = (d: number) => d * Math.PI / 180;
  const R = 6371000;
  const cosLat = Math.cos(toRad(lat));
  const coords = geo.coordinates as [number, number][];
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const x = (lng - lng1) * toRad(1) * R * cosLat;
    const y = (lat - lat1) * toRad(1) * R;
    const dx = (lng2 - lng1) * toRad(1) * R * cosLat;
    const dy = (lat2 - lat1) * toRad(1) * R;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (x * dx + y * dy) / len2)) : 0;
    const px = x - t * dx;
    const py = y - t * dy;
    if (Math.sqrt(px * px + py * py) < threshMeters) return true;
  }
  return false;
}

export default function MapView({ adminMode = false }: { adminMode?: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<globalThis.Map<string, google.maps.Polyline>>(new globalThis.Map());
  const markersRef = useRef<globalThis.Map<string, google.maps.Marker>>(new globalThis.Map());
  const pinMarkerRef = useRef<google.maps.Marker | null>(null);
  const selectedSubPolyRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const suppressClickRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const mainBuilderFitDoneRef = useRef(false);
  const trimMarkerRef = useRef<google.maps.Marker | null>(null);

  const finderPolylinesRef = useRef<globalThis.Map<string, google.maps.Polyline>>(new globalThis.Map());
  const finderMarkersRef = useRef<google.maps.Marker[]>([]);

  const graphOverlayRef = useRef<{ polys: google.maps.Polyline[]; markers: google.maps.Marker[] }>({ polys: [], markers: [] });

  const [mapType, setMapType] = useState<MapType>('roadmap');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [pickerRoutes, setPickerRoutes] = useState<SavedRoute[]>([]);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const closePickerRef = useRef<() => void>(() => {});
  closePickerRef.current = () => { setPickerRoutes([]); setPickerPos(null); };

  const {
    mode,
    builderMode,
    points: builderPoints,
    savedRoutes,
    selectedRouteId,
    categoryFilter,
    showCheckposts,
    sidebarCheckpostFilter,
    pendingFlyTo,
    generatedGeometry,
    clickedCoord,
    mainRouteSubRouteIds,
    mainRouteSegments,
    trimTarget,
    selectRoute,
    addPointAtLatLng,
    addSubRouteToMain,
    removeSubRouteFromMain,
    updatePoint,
  } = useRouteBuilderStore();

  const {
    finderResults,
    finderActiveIdx,
    finderLocations,
    finderStartId,
    finderEndId,
  } = useRouteFinderStore();

  const visibleRoutes = savedRoutes.filter(r => {
    if (!adminMode) return false; // Public: empty map by default; finder/selectedSubPoly handles display
    // Admin: only show main routes (and only the selected one while in builder)
    if (r.type !== 'main') return false;
    if (r.id !== selectedRouteId && mode !== 'create') return false;
    if (categoryFilter && r.category_id !== categoryFilter) return false;
    if (sidebarCheckpostFilter === 'with' && r.has_checkpost !== true) return false;
    if (sidebarCheckpostFilter === 'without' && r.has_checkpost === true) return false;
    return true;
  });

  const activePoints = mode === 'create'
    ? builderPoints
    : (() => {
        if (!selectedRouteId) {
          const seen = new globalThis.Set<string>();
          const all: RoutePoint[] = [];
          if (!adminMode) {
            // Public: empty map by default — no markers until a route is selected
          } else {
            // Admin: collect from main routes + their sub-routes
            for (const route of visibleRoutes) {
              const subIds = route.sub_route_ids ?? [];
              for (const id of subIds) {
                const sub = savedRoutes.find(r => r.id === id);
                for (const pt of (sub?.points ?? [])) {
                  if (!seen.has(pt.id)) { seen.add(pt.id); all.push(pt); }
                }
              }
              for (const pt of (route.points ?? [])) {
                if (!seen.has(pt.id)) { seen.add(pt.id); all.push(pt); }
              }
            }
          }
          return showCheckposts ? all : all.filter(p => p.type !== 'poi');
        }
        const sel = savedRoutes.find(r => r.id === selectedRouteId);
        if (!sel) return [];
        // Sub-route or public selection: show ALL points (always, no checkpost filter in public)
        if (sel.type !== 'main') {
          return [...sel.points].sort((a, b) => a.order - b.order);
        }
        // Admin main route: combine direct points + deduped sub-route points
        const subIds = sel.sub_route_ids ?? [];
        const subPtsDeduped: RoutePoint[] = [];
        subIds.forEach((id, idx) => {
          const sub = savedRoutes.find(r => r.id === id);
          const pts = [...(sub?.points ?? [])].sort((a, b) => a.order - b.order);
          if (idx > 0) {
            const prevLast = subPtsDeduped[subPtsDeduped.length - 1];
            const first = pts[0];
            if (prevLast && first && isBoundaryDuplicate(prevLast, first)) {
              subPtsDeduped.push(...pts.slice(1));
              return;
            }
          }
          subPtsDeduped.push(...pts);
        });
        const pts = [...(sel.points ?? []), ...subPtsDeduped];
        return showCheckposts ? pts : pts.filter(p => p.type !== 'poi');
      })();

  // Load Google Maps and initialise
  useEffect(() => {
    importLibrary('maps').then(() => {
      if (mapRef.current || !mapContainer.current) return;

      const map = new google.maps.Map(mapContainer.current, {
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        clickableIcons: true,
      });

      infoWindowRef.current = new google.maps.InfoWindow();

      map.addListener('click', (e: google.maps.MapMouseEvent & { placeId?: string }) => {
        if (suppressClickRef.current) return;
        // If user clicked a Google Maps POI, let native info window open — don't intercept
        if (e.placeId) return;
        closePickerRef.current();
        // Finder "pick a position on the map" capture
        const finder = useRouteFinderStore.getState();
        if (finder.finderPickTarget && e.latLng) {
          const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          if (finder.finderPickTarget === 'start') finder.setFinderStartPoint(p);
          else finder.setFinderEndPoint(p);
          return;
        }
        const { mode: m, builderMode: bm, addPointAtLatLng: add, setClickedCoord, trimTarget, setTrimTarget } = useRouteBuilderStore.getState();
        if (m === 'create' && bm === 'main' && trimTarget) {
          setTrimTarget(null);
          return;
        }
        if (m === 'create' && bm !== 'main') {
          add(e.latLng!.lat(), e.latLng!.lng());
        } else {
          if (!(m === 'create' && bm === 'main')) {
            useRouteBuilderStore.getState().selectRoute(null);
          }
          infoWindowRef.current?.close();
          if (e.latLng) {
            setClickedCoord({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }
        }
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current.clear();
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current.clear();
      finderPolylinesRef.current.forEach((p) => p.setMap(null));
      finderPolylinesRef.current.clear();
      finderMarkersRef.current.forEach((m) => m.setMap(null));
      finderMarkersRef.current = [];
      selectedSubPolyRef.current?.setMap(null);
      selectedSubPolyRef.current = null;
      trimMarkerRef.current?.setMap(null);
      trimMarkerRef.current = null;
      infoWindowRef.current?.close();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw selected sub-route polyline (suppressed while finder results are on screen)
  useEffect(() => {
    const map = mapRef.current;
    selectedSubPolyRef.current?.setMap(null);
    selectedSubPolyRef.current = null;
    // Finder results already draw the correct sliced geometry; don't overlay the full sub-route on top
    if (!map || !mapReady || !selectedRouteId || finderResults.length > 0) return;
    const sel = savedRoutes.find((r) => r.id === selectedRouteId);
    if (!sel || sel.type === 'main') return;
    const coords = sel.geometry?.coordinates;
    if (!coords?.length) return;
    const path = (coords as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
    selectedSubPolyRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: sel.color,
      strokeOpacity: 1.0,
      strokeWeight: 6,
      map,
      zIndex: 15,
      clickable: false,
    });
  }, [selectedRouteId, mapReady, savedRoutes, finderResults.length]);

  // Map type change
  useEffect(() => {
    mapRef.current?.setMapTypeId(mapType);
  }, [mapType]);

  // Cursor in create mode
  useEffect(() => {
    mapRef.current?.setOptions({ draggableCursor: mode === 'create' ? 'crosshair' : null });
  }, [mode]);

  // Fly to coordinate
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingFlyTo) return;
    map.panTo({ lat: pendingFlyTo.lat, lng: pendingFlyTo.lng });
    map.setZoom(15);
    useRouteBuilderStore.getState().clearFlyTo();
  }, [pendingFlyTo]);

  // Update route polylines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove old polylines
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current.clear();
    trimMarkerRef.current?.setMap(null);
    trimMarkerRef.current = null;

    if (mode !== 'create' && finderResults.length === 0) {
      visibleRoutes.forEach((route) => {
        const geometry = adminMode ? getDisplayGeometry(route, savedRoutes) : route.geometry;
        if (!geometry?.coordinates?.length) return;

        const isSelected = route.id === selectedRouteId;
        const path = (geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));

        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: isSelected ? '#dc2626' : route.color,
          strokeOpacity: isSelected ? 1.0 : 0.8,
          strokeWeight: isSelected ? 7 : 4,
          map,
          zIndex: isSelected ? 10 : 1,
          clickable: true,
        });

        if (!adminMode) {
          // Public: simple click → select sub-route, no picker
          polyline.addListener('click', () => {
            suppressClickRef.current = true;
            setTimeout(() => { suppressClickRef.current = false; }, 0);
            infoWindowRef.current?.close();
            useRouteBuilderStore.getState().selectRoute(route.id);
          });
        } else {
          // Admin: existing picker logic for overlapping main routes
          polyline.addListener('click', (e: google.maps.MapMouseEvent) => {
            suppressClickRef.current = true;
            setTimeout(() => { suppressClickRef.current = false; }, 0);
            infoWindowRef.current?.close();

            const dom = e.domEvent as MouseEvent;
            const rect = mapContainer.current?.getBoundingClientRect();
            const px = rect ? dom.clientX - rect.left : dom.clientX;
            const py = rect ? dom.clientY - rect.top : dom.clientY;

            const { savedRoutes: sr, categoryFilter: cf, sidebarCheckpostFilter: scf } = useRouteBuilderStore.getState();
            const allVisible = sr.filter((r) => {
              if (r.type !== 'main') return false;
              if (cf && r.category_id !== cf) return false;
              if (scf === 'with' && r.has_checkpost !== true) return false;
              if (scf === 'without' && r.has_checkpost === true) return false;
              return true;
            });

            const latlng = e.latLng!;
            const near = allVisible.filter((r) => {
              const geo = getDisplayGeometry(r, sr);
              return geo ? isNearGeometry(latlng.lat(), latlng.lng(), geo) : false;
            });

            if (near.length <= 1) {
              useRouteBuilderStore.getState().selectRoute(near[0]?.id ?? route.id);
              closePickerRef.current();
            } else {
              setPickerRoutes(near);
              setPickerPos({ x: px, y: py });
            }
          });
        }

        polyline.addListener('mouseover', () => {
          if (useRouteBuilderStore.getState().mode !== 'create') {
            map.setOptions({ draggableCursor: 'pointer' });
          }
        });
        polyline.addListener('mouseout', () => {
          const { mode: m } = useRouteBuilderStore.getState();
          map.setOptions({ draggableCursor: m === 'create' ? 'crosshair' : null });
        });

        polylinesRef.current.set(route.id, polyline);
      });
    }

    // Main-route builder: draw all sub-routes, click to toggle membership / pick trim points
    if (mode === 'create' && builderMode === 'main') {
      savedRoutes.filter((r) => r.type !== 'main').forEach((route) => {
        const geometry = route.geometry;
        if (!geometry?.coordinates?.length) return;

        const coordsLngLat = geometry.coordinates as [number, number][];
        const isSelected = mainRouteSubRouteIds.includes(route.id);
        const segment = mainRouteSegments[route.id];
        const isTrimming = trimTarget?.routeId === route.id;
        const path = coordsLngLat.map(([lng, lat]) => ({ lat, lng }));

        const fullSelectedNoSegment = isSelected && !segment;

        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: fullSelectedNoSegment ? '#dc2626' : route.color,
          strokeOpacity: fullSelectedNoSegment ? 1.0 : (isSelected ? 0.35 : 0.6),
          strokeWeight: fullSelectedNoSegment ? 7 : 4,
          map,
          zIndex: fullSelectedNoSegment ? 10 : 1,
          clickable: true,
        });

        polyline.addListener('click', (e: google.maps.PolyMouseEvent) => {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 0);
          const state = useRouteBuilderStore.getState();
          if (state.trimTarget?.routeId === route.id && e.latLng) {
            const idx = nearestCoordIndex(coordsLngLat, e.latLng.lat(), e.latLng.lng());
            if (state.trimTarget.startIdx === null) {
              state.setTrimTarget({ routeId: route.id, startIdx: idx });
            } else {
              const a = Math.min(state.trimTarget.startIdx, idx);
              const b = Math.max(state.trimTarget.startIdx, idx);
              state.setMainRouteSegment(route.id, a, b);
              state.setTrimTarget(null);
            }
            return;
          }
          if (state.trimTarget) return;
          if (state.mainRouteSubRouteIds.includes(route.id)) state.removeSubRouteFromMain(route.id);
          else state.addSubRouteToMain(route.id);
        });

        polylinesRef.current.set(route.id, polyline);

        if (segment) {
          const segPath = path.slice(segment.startIdx, segment.endIdx + 1);
          const segPolyline = new google.maps.Polyline({
            path: segPath,
            geodesic: true,
            strokeColor: '#dc2626',
            strokeOpacity: 1.0,
            strokeWeight: 7,
            map,
            zIndex: 11,
            clickable: false,
          });
          polylinesRef.current.set(`${route.id}__segment`, segPolyline);
        }

        if (isTrimming && trimTarget!.startIdx !== null) {
          const startPt = path[trimTarget!.startIdx];
          if (startPt) {
            trimMarkerRef.current = new google.maps.Marker({
              position: startPt,
              map,
              zIndex: 30,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#dc2626',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              },
            });
          }
        }
      });
    }

    // Preview route (during create)
    if (generatedGeometry?.coordinates?.length) {
      const path = (generatedGeometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
      const preview = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#ff8c00',
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
        zIndex: 20,
        clickable: false,
      });
      polylinesRef.current.set('__preview__', preview);
    }
  }, [visibleRoutes, selectedRouteId, mode, builderMode, savedRoutes, mainRouteSubRouteIds, mainRouteSegments, trimTarget, generatedGeometry, mapReady, finderResults.length]);

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const current = new Set(activePoints.map((p) => p.id));

    for (const [id, marker] of markersRef.current) {
      if (!current.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }

    for (const point of activePoints) {
      const size = point.type === 'waypoint' ? 28 : 38;
      if (markersRef.current.has(point.id)) {
        const m = markersRef.current.get(point.id)!;
        const pos = m.getPosition();
        if (pos && (Math.abs(pos.lat() - point.lat) > 1e-7 || Math.abs(pos.lng() - point.lng) > 1e-7)) {
          m.setPosition({ lat: point.lat, lng: point.lng });
        }
        m.setIcon(getMarkerIcon(point, size));
      } else {
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map,
          icon: getMarkerIcon(point, size),
          draggable: mode === 'create',
          zIndex: 100,
        });

        marker.addListener('click', () => {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 0);
          if (hasPopupContent(point)) {
            infoWindowRef.current!.setContent(getPopupHTML(point));
            infoWindowRef.current!.open({ map, anchor: marker });
          }
        });

        marker.addListener('dragend', () => {
          if (useRouteBuilderStore.getState().mode !== 'create') return;
          const pos = marker.getPosition()!;
          updatePoint(point.id, { lat: pos.lat(), lng: pos.lng() });
        });

        markersRef.current.set(point.id, marker);
      }
    }
  }, [activePoints, mode, mapReady, updatePoint]);

  // Clicked/searched coordinate pin marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!clickedCoord) {
      pinMarkerRef.current?.setMap(null);
      pinMarkerRef.current = null;
      return;
    }
    if (pinMarkerRef.current) {
      pinMarkerRef.current.setPosition({ lat: clickedCoord.lat, lng: clickedCoord.lng });
    } else {
      pinMarkerRef.current = new google.maps.Marker({
        position: { lat: clickedCoord.lat, lng: clickedCoord.lng },
        map,
        icon: getPinIcon('#f97316'),
        zIndex: 200,
        title: `${clickedCoord.lat.toFixed(6)}, ${clickedCoord.lng.toFixed(6)}`,
      });
    }
  }, [clickedCoord, mapReady]);

  // Auto-fit to all routes on first load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || initialFitDoneRef.current) return;
    if (visibleRoutes.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;
    visibleRoutes.forEach(route => {
      const geo = getDisplayGeometry(route, savedRoutes);
      if (geo?.coordinates?.length) {
        (geo.coordinates as [number, number][]).forEach(([lng, lat]) => {
          bounds.extend({ lat, lng });
          hasCoords = true;
        });
      }
    });
    if (hasCoords) {
      map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      initialFitDoneRef.current = true;
    }
  }, [mapReady, savedRoutes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fit to all sub-routes when entering the main-route builder
  useEffect(() => {
    if (!(mode === 'create' && builderMode === 'main')) {
      mainBuilderFitDoneRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map || !mapReady || mainBuilderFitDoneRef.current) return;
    const subRoutes = savedRoutes.filter((r) => r.type !== 'main');
    if (subRoutes.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;
    subRoutes.forEach((route) => {
      if (route.geometry?.coordinates?.length) {
        (route.geometry.coordinates as [number, number][]).forEach(([lng, lat]) => {
          bounds.extend({ lat, lng });
          hasCoords = true;
        });
      }
    });
    if (hasCoords) {
      map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      mainBuilderFitDoneRef.current = true;
    }
  }, [mode, builderMode, mapReady, savedRoutes]);

  // Zoom to selected route (works for both main routes and sub-routes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId) return;
    const route = savedRoutes.find((r) => r.id === selectedRouteId);
    if (!route) return;
    const geometry = route.type !== 'main' ? route.geometry : getDisplayGeometry(route, savedRoutes);
    if (!geometry?.coordinates?.length) return;
    const bounds = new google.maps.LatLngBounds();
    (geometry.coordinates as [number, number][]).forEach(([lng, lat]) => bounds.extend({ lat, lng }));
    map.fitBounds(bounds, { top: 120, right: 60, bottom: 60, left: 60 });
  }, [selectedRouteId, savedRoutes]);

  // Render route finder results
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    finderPolylinesRef.current.forEach((p) => p.setMap(null));
    finderPolylinesRef.current.clear();
    finderMarkersRef.current.forEach((m) => m.setMap(null));
    finderMarkersRef.current = [];

    if (finderResults.length === 0) return;

    // Dim sub-routes as context
    savedRoutes
      .filter((r) => (!r.type || r.type === 'sub') && r.geometry?.coordinates?.length)
      .forEach((route) => {
        const path = (route.geometry!.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
        const poly = new google.maps.Polyline({
          path, geodesic: true, strokeColor: route.color,
          strokeOpacity: 0.2, strokeWeight: 2, map, zIndex: 0, clickable: false,
        });
        finderPolylinesRef.current.set(`ctx__${route.id}`, poly);
      });

    // Draw each finder alternative — active is bold, others are thin but clickable
    finderResults.forEach((route, routeIdx) => {
      const isActive = routeIdx === finderActiveIdx;
      route.segments.forEach((seg, segIdx) => {
        const coords = seg.geometry.coordinates as [number, number][];
        const path = coords.map(([lng, lat]) => ({ lat, lng }));
        const isBridge = seg.type === 'bridge';
        const poly = new google.maps.Polyline({
          path, geodesic: true,
          strokeColor: isActive ? (isBridge ? '#f97316' : '#ef4444') : '#16a34a',
          strokeOpacity: isActive ? 1.0 : 0.65,
          strokeWeight: isActive ? (isBridge ? 4 : 7) : 5,
          map, zIndex: isActive ? (isBridge ? 8 : 10) : 2,
          clickable: !isActive,
        });
        if (!isActive) {
          // Invisible wide hit-area polyline so inactive routes are easy to tap
          const hitArea = new google.maps.Polyline({
            path, geodesic: true,
            strokeColor: '#000000', strokeOpacity: 0, strokeWeight: 24,
            map, zIndex: 3, clickable: true,
          });
          hitArea.addListener('click', () => {
            useRouteFinderStore.getState().setFinderActiveIdx(routeIdx);
          });
          hitArea.addListener('mouseover', () => {
            poly.setOptions({ strokeOpacity: 1.0, strokeWeight: 7 });
            map.setOptions({ draggableCursor: 'pointer' });
          });
          hitArea.addListener('mouseout', () => {
            poly.setOptions({ strokeOpacity: 0.65, strokeWeight: 5 });
            map.setOptions({ draggableCursor: null });
          });
          poly.addListener('click', () => {
            useRouteFinderStore.getState().setFinderActiveIdx(routeIdx);
          });
          finderPolylinesRef.current.set(`hit_${routeIdx}_${segIdx}`, hitArea);
        }
        finderPolylinesRef.current.set(`res_${routeIdx}_${segIdx}`, poly);
      });
    });

    // Start pin (green) and end pin (red) — named location or map-picked point
    const { finderStartPoint, finderEndPoint } = useRouteFinderStore.getState();
    const startLoc = finderLocations.find((l) => l.id === finderStartId) ?? finderStartPoint;
    const endLoc = finderLocations.find((l) => l.id === finderEndId) ?? finderEndPoint;
    const pinDefs = [
      { loc: startLoc, color: '#22c55e' },
      { loc: endLoc, color: '#ef4444' },
    ];
    pinDefs.forEach(({ loc, color }) => {
      if (!loc) return;
      const m = new google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng }, map, zIndex: 200,
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 10,
          fillColor: color, fillOpacity: 1,
          strokeColor: '#ffffff', strokeWeight: 2,
        },
      });
      finderMarkersRef.current.push(m);
    });

    // Fit to all routes so user can see every alternative on the map
    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;
    finderResults.forEach((route) => {
      (route.geometry.coordinates as [number, number][]).forEach(([lng, lat]) => {
        bounds.extend({ lat, lng });
        hasBounds = true;
      });
    });
    if (hasBounds) map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 360 });
  }, [finderResults, finderActiveIdx, finderLocations, finderStartId, finderEndId, mapReady, savedRoutes]);

  // Graph admin overlay: edges as thin polylines (bridges dashed orange), nodes
  // as clickable circles (place = filled, junction = hollow). Self-contained —
  // touches nothing outside graphOverlayRef.
  const { graphData, graphAdminMode, connectorNodeA, connectorNodeB, selectedNodeId } = useGraphStore();
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    graphOverlayRef.current.polys.forEach((p) => p.setMap(null));
    graphOverlayRef.current.markers.forEach((m) => m.setMap(null));
    graphOverlayRef.current = { polys: [], markers: [] };

    if (!adminMode || graphAdminMode === 'off' || !graphData) return;

    for (const edge of graphData.edges) {
      const path = (edge.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));
      const isBridge = edge.source === 'bridge';
      graphOverlayRef.current.polys.push(new google.maps.Polyline({
        path, geodesic: true, map, clickable: false, zIndex: 4,
        strokeColor: isBridge ? '#f97316' : '#6366f1',
        strokeOpacity: isBridge ? 0 : 0.7,
        strokeWeight: 2.5,
        ...(isBridge ? {
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#f97316', strokeWeight: 2.5, scale: 2 }, offset: '0', repeat: '12px' }],
        } : {}),
      }));
    }

    for (const node of graphData.nodes) {
      const isConnectorPick = node.id === connectorNodeA || node.id === connectorNodeB;
      const isSelected = node.id === selectedNodeId;
      const m = new google.maps.Marker({
        position: { lat: node.lat, lng: node.lng }, map, zIndex: isConnectorPick || isSelected ? 60 : 50,
        title: node.name ?? '(unnamed junction)',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isConnectorPick || isSelected ? 9 : 6,
          fillColor: isConnectorPick ? '#f59e0b' : isSelected ? '#ec4899' : node.kind === 'place' ? '#6366f1' : '#ffffff',
          fillOpacity: node.kind === 'place' || isConnectorPick || isSelected ? 1 : 0.9,
          strokeColor: node.kind === 'place' ? '#ffffff' : '#6366f1',
          strokeWeight: 2,
        },
      });
      m.addListener('click', () => {
        const gs = useGraphStore.getState();
        if (gs.graphAdminMode === 'connector') {
          if (!gs.connectorNodeA) gs.setConnectorNode('A', node.id);
          else if (!gs.connectorNodeB && node.id !== gs.connectorNodeA) gs.setConnectorNode('B', node.id);
          else { gs.setConnectorNode('A', node.id); gs.setConnectorNode('B', null); }
        } else {
          gs.setSelectedNodeId(node.id === gs.selectedNodeId ? null : node.id);
        }
      });
      graphOverlayRef.current.markers.push(m);
    }
  }, [graphData, graphAdminMode, connectorNodeA, connectorNodeB, selectedNodeId, mapReady, adminMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Route picker — admin only, shown when multiple main routes overlap at click point */}
      {adminMode && pickerRoutes.length > 1 && pickerPos && (
        <div
          className="absolute z-50 bg-background border border-border rounded-lg shadow-xl p-1.5 min-w-[220px] max-w-[320px] max-h-[300px] flex flex-col"
          style={{ left: pickerPos.x + 8, top: pickerPos.y - 8 }}
        >
          <p className="text-[11px] text-muted-foreground font-medium px-2 py-1 flex-shrink-0">Select route:</p>
          <div className="overflow-y-auto flex-1">
            {pickerRoutes.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  useRouteBuilderStore.getState().selectRoute(r.id);
                  setPickerRoutes([]);
                  setPickerPos(null);
                }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-accent text-left transition-colors"
              >
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: r.color }} />
                <span className="text-sm text-foreground leading-snug">{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Map type toggle */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="bg-background border rounded-md shadow-lg p-1 min-w-[130px] flex flex-col gap-1">
            {(['roadmap', 'satellite', 'terrain'] as MapType[]).map((t) => (
              <button
                key={t}
                className={`text-sm px-3 py-1.5 rounded-sm text-left capitalize ${mapType === t ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                onClick={() => { setMapType(t); setMenuOpen(false); }}
              >
                {t === 'roadmap' ? 'Street' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="shadow-lg border h-10 w-10"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Layers className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
