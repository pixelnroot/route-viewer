'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Layers } from 'lucide-react';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { Button } from '@/components/ui/button';
import type { PointType, RoutePoint, SavedRoute } from '@/types/routes';

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

function getMarkerIcon(type: PointType, _size: number): google.maps.Icon {
  const sizes: Record<PointType, number> = { start: 32, destination: 32, poi: 28, waypoint: 22 };
  const s = sizes[type];
  return {
    url: createCirclePng(POINT_COLORS[type], POINT_LETTER[type], s),
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
  return `<div style="padding:4px;max-width:240px;font-family:sans-serif;">
    <h3 style="font-weight:600;font-size:13px;margin:0 0 6px 0;">${point.label}</h3>
    ${point.imageUrl ? `<img src="${point.imageUrl}" alt="${point.label}" style="width:100%;height:auto;border-radius:6px;margin-bottom:6px;object-fit:cover;display:block;"/>` : ''}
    ${point.note ? `<p style="font-size:12px;line-height:1.5;margin:0;color:#444;">${point.note}</p>` : ''}
  </div>`;
}

function hasPopupContent(point: RoutePoint): boolean {
  return !!(point.note || point.imageUrl);
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

  const [mapType, setMapType] = useState<MapType>('roadmap');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [pickerRoutes, setPickerRoutes] = useState<SavedRoute[]>([]);
  const [pickerPos, setPickerPos] = useState<{ x: number; y: number } | null>(null);
  const closePickerRef = useRef<() => void>(() => {});
  closePickerRef.current = () => { setPickerRoutes([]); setPickerPos(null); };

  const {
    mode,
    points: builderPoints,
    savedRoutes,
    selectedRouteId,
    categoryFilter,
    showCheckposts,
    sidebarCheckpostFilter,
    pendingFlyTo,
    generatedGeometry,
    clickedCoord,
    selectRoute,
    addPointAtLatLng,
    updatePoint,
  } = useRouteBuilderStore();

  const visibleRoutes = savedRoutes.filter(r => {
    if (r.type !== 'main') return false;
    // In admin mode: only draw the selected main route; everything else stays hidden
    if (adminMode && r.id !== selectedRouteId) return false;
    if (categoryFilter && r.category_id !== categoryFilter) return false;
    const hasPoi = routeHasPoi(r, savedRoutes);
    if (sidebarCheckpostFilter === 'with' && !hasPoi) return false;
    if (sidebarCheckpostFilter === 'without' && hasPoi) return false;
    return true;
  });

  const activePoints = mode === 'create'
    ? builderPoints
    : (() => {
        if (!selectedRouteId) return [];
        const sel = savedRoutes.find(r => r.id === selectedRouteId);
        if (!sel) return [];
        // Sub-route: show its own points
        if (sel.type !== 'main') {
          const pts = [...sel.points].sort((a, b) => a.order - b.order);
          return showCheckposts ? pts : pts.filter(p => p.type !== 'poi');
        }
        // Main route: combine direct points + deduped sub-route points
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
        const { mode: m, addPointAtLatLng: add, setClickedCoord } = useRouteBuilderStore.getState();
        if (m === 'create') {
          add(e.latLng!.lat(), e.latLng!.lng());
        } else {
          useRouteBuilderStore.getState().selectRoute(null);
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
      selectedSubPolyRef.current?.setMap(null);
      selectedSubPolyRef.current = null;
      infoWindowRef.current?.close();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw selected sub-route polyline (sub-routes are hidden from main map; show only when selected)
  useEffect(() => {
    const map = mapRef.current;
    selectedSubPolyRef.current?.setMap(null);
    selectedSubPolyRef.current = null;
    if (!map || !mapReady || !selectedRouteId) return;
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
  }, [selectedRouteId, mapReady, savedRoutes]);

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

    if (mode !== 'create') {
      visibleRoutes.forEach((route) => {
        const geometry = getDisplayGeometry(route, savedRoutes);
        if (!geometry?.coordinates?.length) return;

        const isSelected = route.id === selectedRouteId;
        const path = (geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));

        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: route.color,
          strokeOpacity: isSelected ? 1.0 : 0.8,
          strokeWeight: isSelected ? 7 : 4,
          map,
          zIndex: isSelected ? 10 : 1,
          clickable: true,
        });

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
            const hp = routeHasPoi(r, sr);
            if (scf === 'with' && !hp) return false;
            if (scf === 'without' && hp) return false;
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
  }, [visibleRoutes, selectedRouteId, mode, generatedGeometry, mapReady]);

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
        m.setIcon(getMarkerIcon(point.type, size));
      } else {
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map,
          icon: getMarkerIcon(point.type, size),
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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* Route picker — shown when multiple routes overlap at click point */}
      {pickerRoutes.length > 1 && pickerPos && (
        <div
          className="absolute z-50 bg-background border border-border rounded-lg shadow-xl p-1.5 min-w-[200px] max-w-[260px]"
          style={{ left: pickerPos.x + 8, top: pickerPos.y - 8 }}
        >
          <p className="text-[11px] text-muted-foreground font-medium px-2 py-1">Select route:</p>
          {pickerRoutes.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                useRouteBuilderStore.getState().selectRoute(r.id);
                setPickerRoutes([]);
                setPickerPos(null);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors"
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-sm truncate text-foreground">{r.name}</span>
            </button>
          ))}
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
