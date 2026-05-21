'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap, Marker, Popup } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer } from '@deck.gl/layers';
import { Layers } from 'lucide-react';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { Button } from '@/components/ui/button';
import type { PointType, SavedRoute, RoutePoint } from '@/types/routes';

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/bright';

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

const INITIAL_CENTER: [number, number] = [90.4125, 23.7937];
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

function createMarkerEl(type: PointType, label: string, category?: string, icon?: string): HTMLElement {
  const el = document.createElement('div');
  const hasIcon = type === 'poi' && !!icon;
  const isDiamond = type === 'poi' && !hasIcon;
  el.style.cssText = `
    width: 32px; height: 32px;
    border-radius: ${isDiamond ? '4px' : (type === 'poi' ? '6px' : '50%')};
    background: ${hasIcon ? 'white' : POINT_COLORS[type]};
    border: 2px solid ${hasIcon ? POINT_COLORS[type] : 'white'};
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: ${hasIcon ? '18px' : '11px'};
    cursor: grab;
    transform: ${isDiamond ? 'rotate(45deg)' : 'none'};
    line-height: 1;
  `;
  const inner = document.createElement('span');
  if (hasIcon) {
    inner.textContent = icon!;
  } else {
    let char = label.charAt(0).toUpperCase() || POINT_LETTER[type];
    if (type === 'poi' && category) {
      char = category.charAt(0).toUpperCase();
    }
    inner.textContent = char;
    if (isDiamond) inner.style.transform = 'rotate(-45deg)';
  }
  el.appendChild(inner);
  return el;
}

function getPopupHTML(point: RoutePoint) {
  return `
    <div style="padding: 4px; max-width: 220px; font-family: sans-serif;">
      <h3 style="font-weight: 600; font-size: 14px; margin: 0 0 4px 0;">${point.label}</h3>
      ${point.category ? `<p style="font-size: 11px; color: #666; margin: 0 0 6px 0; text-transform: capitalize; font-weight: 500;">Type: ${point.category}</p>` : ''}
      ${point.imageUrl ? `<img src="${point.imageUrl}" alt="${point.label}" style="width: 100%; height: auto; border-radius: 4px; margin-bottom: 8px; object-fit: cover;" />` : ''}
      ${point.note ? `<p style="font-size: 12px; line-height: 1.4; margin: 0; color: #333;">${point.note}</p>` : ''}
    </div>
  `;
}

interface PathData {
  path: [number, number][];
  color: [number, number, number, number];
  width: number;
}

function hexToRgba(hex: string, alpha = 220): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    alpha,
  ];
}

type MapMode = 'street' | 'satellite';

export default function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());

  const [mapMode, setMapMode] = useState<MapMode>('street');
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    mode,
    points: builderPoints,
    generatedGeometry,
    savedRoutes,
    selectedRouteId,
    addPointAtLatLng,
    updatePoint,
  } = useRouteBuilderStore();

  const activePoints = mode === 'create' 
    ? builderPoints 
    : (selectedRouteId ? savedRoutes.find(r => r.id === selectedRouteId)?.points || [] : []);

  // Init map + deck.gl overlay
  useEffect(() => {
    if (mapRef.current || !mapContainer.current) return;

    const map = new MLMap({
      container: mapContainer.current,
      style: mapMode === 'street' ? STREET_STYLE : (SATELLITE_STYLE as any),
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });

    const overlay = new MapboxOverlay({ layers: [] });
    map.on('load', () => map.addControl(overlay as never));

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []); // Intentionally only run once on mount

  // Change style when mapMode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapMode === 'street' ? STREET_STYLE : (SATELLITE_STYLE as any));
  }, [mapMode]);

  // Click handler — create mode only
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      if (mode !== 'create') return;
      addPointAtLatLng(e.lngLat.lat, e.lngLat.lng);
    };
    map.on('click', handler);
    return () => { map.off('click', handler); };
  }, [mode, addPointAtLatLng]);

  // Cursor in create mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = mode === 'create' ? 'crosshair' : '';
  }, [mode]);

  // Sync markers to points
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Filter out waypoints so they don't show as markers
    const visiblePoints = activePoints.filter(p => p.type !== 'waypoint');
    const current = new Set(visiblePoints.map((p) => p.id));

    // Remove stale
    for (const [id, marker] of markersRef.current) {
      if (!current.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add / update
    for (const point of visiblePoints) {
      if (markersRef.current.has(point.id)) {
        const m = markersRef.current.get(point.id)!;
        const ll = m.getLngLat();
        if (Math.abs(ll.lat - point.lat) > 1e-7 || Math.abs(ll.lng - point.lng) > 1e-7) {
          m.setLngLat([point.lng, point.lat]);
        }
        m.setDraggable(mode === 'create');

        // Refresh marker element when icon/category/label changes
        const newEl = createMarkerEl(point.type, point.label, point.category, point.icon);
        const oldEl = m.getElement();
        if (oldEl.dataset.icon !== (point.icon ?? '') || oldEl.dataset.category !== (point.category ?? '') || oldEl.dataset.label !== point.label) {
          newEl.dataset.icon = point.icon ?? '';
          newEl.dataset.category = point.category ?? '';
          newEl.dataset.label = point.label;
          oldEl.replaceWith(newEl);
        }

        if (point.type === 'poi') {
          const popup = m.getPopup();
          if (popup) popup.setHTML(getPopupHTML(point));
        }
      } else {
        const el = createMarkerEl(point.type, point.label, point.category, point.icon);
        el.dataset.icon = point.icon ?? '';
        el.dataset.category = point.category ?? '';
        el.dataset.label = point.label;
        const marker = new Marker({ element: el, draggable: mode === 'create' })
          .setLngLat([point.lng, point.lat]);
          
        if (point.type === 'poi') {
          marker.setPopup(new Popup({ offset: 25, closeButton: false }).setHTML(getPopupHTML(point)));
        }
        
        marker.addTo(map);

        marker.on('dragend', () => {
          if (mode !== 'create') return;
          const { lat, lng } = marker.getLngLat();
          updatePoint(point.id, { lat, lng });
        });
        markersRef.current.set(point.id, marker);
      }
    }
  }, [activePoints, mode, updatePoint]);

  // Update deck.gl layers
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const layers = [];

    // Saved route lines
    const savedData: PathData[] = savedRoutes
      .filter((r) => r.geometry?.coordinates?.length)
      .map((r) => ({
        path: r.geometry!.coordinates as [number, number][],
        color: hexToRgba(r.color),
        width: 4,
      }));

    if (savedData.length) {
      layers.push(
        new PathLayer<PathData>({
          id: 'saved-routes',
          data: savedData,
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: (d) => d.width,
          widthUnits: 'pixels',
          widthMinPixels: 2,
          jointRounded: true,
          capRounded: true,
        })
      );
    }

    // In-progress preview
    if (generatedGeometry?.coordinates?.length) {
      layers.push(
        new PathLayer<PathData>({
          id: 'preview-route',
          data: [
            {
              path: generatedGeometry.coordinates as [number, number][],
              color: [255, 140, 0, 240],
              width: 5,
            },
          ],
          getPath: (d) => d.path,
          getColor: (d) => d.color,
          getWidth: (d) => d.width,
          widthUnits: 'pixels',
          widthMinPixels: 3,
          jointRounded: true,
          capRounded: true,
        })
      );
    }

    overlay.setProps({ layers });
  }, [savedRoutes, generatedGeometry]);

  // Zoom to selected route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId) return;
    const route = savedRoutes.find((r) => r.id === selectedRouteId);
    if (!route?.geometry?.coordinates?.length) return;
    const coords = route.geometry.coordinates as [number, number][];
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, duration: 800 }
    );
  }, [selectedRouteId, savedRoutes]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
      
      {/* Map Mode Toggle Control */}
      <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
        {menuOpen && (
          <div className="bg-background border rounded-md shadow-lg p-1 min-w-[120px] flex flex-col gap-1">
            <button
              className={`text-sm px-3 py-1.5 rounded-sm text-left ${mapMode === 'street' ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              onClick={() => { setMapMode('street'); setMenuOpen(false); }}
            >
              Street (Bright)
            </button>
            <button
              className={`text-sm px-3 py-1.5 rounded-sm text-left ${mapMode === 'satellite' ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
              onClick={() => { setMapMode('satellite'); setMenuOpen(false); }}
            >
              Satellite (Esri)
            </button>
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
