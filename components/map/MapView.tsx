'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { Layers } from 'lucide-react';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { Button } from '@/components/ui/button';
import type { PointType, RoutePoint } from '@/types/routes';

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

function createMarkerSvgUrl(type: PointType, label: string, category?: string, icon?: string): string {
  const color = POINT_COLORS[type];
  const isWaypoint = type === 'waypoint';
  const hasIcon = type === 'poi' && !!icon;
  const isDiamond = type === 'poi' && !hasIcon;
  const size = isWaypoint ? 20 : 32;
  const half = size / 2;
  const r = half - 2;
  const fontSize = hasIcon ? Math.floor(size * 0.55) : (isWaypoint ? 9 : 11);

  let text = hasIcon
    ? icon!
    : (type === 'poi' && category ? category[0].toUpperCase() : label.charAt(0).toUpperCase() || POINT_LETTER[type]);

  let shape: string;
  if (isDiamond) {
    const d = size - 8;
    shape = `<rect x="${(size-d)/2}" y="${(size-d)/2}" width="${d}" height="${d}" rx="2" fill="${color}" stroke="white" stroke-width="2" transform="rotate(45,${half},${half})"/>`;
  } else {
    shape = `<circle cx="${half}" cy="${half}" r="${r}" fill="${hasIcon ? 'white' : color}" stroke="${hasIcon ? color : 'white'}" stroke-width="2"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><filter id="s"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.4"/></filter><g filter="url(#s)">${shape}</g><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="${hasIcon ? '#333' : 'white'}" font-size="${fontSize}" font-weight="700" font-family="sans-serif">${text}</text></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<globalThis.Map<string, google.maps.Polyline>>(new globalThis.Map());
  const markersRef = useRef<globalThis.Map<string, google.maps.Marker>>(new globalThis.Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const suppressClickRef = useRef(false);

  const [mapType, setMapType] = useState<MapType>('roadmap');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const {
    mode,
    points: builderPoints,
    savedRoutes,
    selectedRouteId,
    categoryFilter,
    pendingFlyTo,
    generatedGeometry,
    selectRoute,
    addPointAtLatLng,
    updatePoint,
  } = useRouteBuilderStore();

  const activePoints = mode === 'create'
    ? builderPoints
    : savedRoutes.flatMap((r) => {
        if (categoryFilter && r.category_id !== categoryFilter) return [];
        return r.points ?? [];
      });

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
        clickableIcons: false,
      });

      infoWindowRef.current = new google.maps.InfoWindow();

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (suppressClickRef.current) return;
        const { mode: m, addPointAtLatLng: add } = useRouteBuilderStore.getState();
        if (m === 'create') {
          add(e.latLng!.lat(), e.latLng!.lng());
        } else {
          useRouteBuilderStore.getState().selectRoute(null);
          infoWindowRef.current?.close();
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
      infoWindowRef.current?.close();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      savedRoutes.forEach((route) => {
        if (!route.geometry?.coordinates?.length) return;
        if (categoryFilter && route.category_id !== categoryFilter) return;

        const isSelected = route.id === selectedRouteId;
        const path = (route.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng }));

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

        polyline.addListener('click', () => {
          suppressClickRef.current = true;
          setTimeout(() => { suppressClickRef.current = false; }, 0);
          useRouteBuilderStore.getState().selectRoute(route.id);
          infoWindowRef.current?.close();
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
  }, [savedRoutes, selectedRouteId, categoryFilter, mode, generatedGeometry, mapReady]);

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
      if (markersRef.current.has(point.id)) {
        const m = markersRef.current.get(point.id)!;
        const pos = m.getPosition();
        if (pos && (Math.abs(pos.lat() - point.lat) > 1e-7 || Math.abs(pos.lng() - point.lng) > 1e-7)) {
          m.setPosition({ lat: point.lat, lng: point.lng });
        }
        // Update icon if label/icon/category changed
        const size = point.type === 'waypoint' ? 20 : 32;
        m.setIcon({
          url: createMarkerSvgUrl(point.type, point.label, point.category, point.icon),
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(size / 2, size / 2),
        });
      } else {
        const size = point.type === 'waypoint' ? 20 : 32;
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map,
          icon: {
            url: createMarkerSvgUrl(point.type, point.label, point.category, point.icon),
            scaledSize: new google.maps.Size(size, size),
            anchor: new google.maps.Point(size / 2, size / 2),
          },
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

  // Zoom to selected route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId) return;
    const route = savedRoutes.find((r) => r.id === selectedRouteId);
    if (!route?.geometry?.coordinates?.length) return;
    const bounds = new google.maps.LatLngBounds();
    (route.geometry.coordinates as [number, number][]).forEach(([lng, lat]) => bounds.extend({ lat, lng }));
    map.fitBounds(bounds, { top: 120, right: 60, bottom: 60, left: 60 });
  }, [selectedRouteId, savedRoutes]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

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
