'use client';

import { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import type { SavedRoute } from '@/types/routes';

setOptions({ key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!, v: 'weekly' });

interface Props {
  routes: SavedRoute[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}

export default function CoveredMapView({ routes, selectedId, onSelect, onDeselect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const fitDoneRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    importLibrary('maps').then(() => {
      if (mapRef.current || !containerRef.current) return;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: 21.42, lng: 92.17 },
        zoom: 11,
        mapTypeId: 'roadmap',
        disableDefaultUI: false,
        zoomControl: true,
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
      });
      map.addListener('click', () => onDeselect());
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current.clear();
      mapRef.current = null;
      fitDoneRef.current = false;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current.clear();

    const bounds = new google.maps.LatLngBounds();
    let hasBounds = false;

    for (const route of routes) {
      if (!route.geometry?.coordinates?.length) continue;
      const coords = route.geometry.coordinates as [number, number][];
      const path = coords.map(([lng, lat]) => ({ lat, lng }));
      const isSelected = route.id === selectedId;

      const poly = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: route.color || '#3b82f6',
        strokeOpacity: isSelected ? 1.0 : selectedId ? 0.25 : 0.75,
        strokeWeight: isSelected ? 7 : 3,
        map,
        zIndex: isSelected ? 10 : 1,
        clickable: true,
      });

      poly.addListener('click', (e: google.maps.MapMouseEvent) => {
        e.stop?.();
        onSelect(route.id);
      });
      poly.addListener('mouseover', () => {
        if (route.id !== selectedId) poly.setOptions({ strokeOpacity: 0.9, strokeWeight: 5 });
        map.setOptions({ draggableCursor: 'pointer' });
      });
      poly.addListener('mouseout', () => {
        if (route.id !== selectedId) poly.setOptions({ strokeOpacity: selectedId ? 0.25 : 0.75, strokeWeight: 3 });
        map.setOptions({ draggableCursor: null });
      });

      polylinesRef.current.set(route.id, poly);
      coords.forEach(([lng, lat]) => { bounds.extend({ lat, lng }); hasBounds = true; });
    }

    if (hasBounds && !fitDoneRef.current) {
      map.fitBounds(bounds, 40);
      fitDoneRef.current = true;
    }

    if (selectedId) {
      const selRoute = routes.find((r) => r.id === selectedId);
      if (selRoute?.geometry?.coordinates?.length) {
        const coords = selRoute.geometry.coordinates as [number, number][];
        const midIdx = Math.floor(coords.length / 2);
        map.panTo({ lat: coords[midIdx][1], lng: coords[midIdx][0] });
      }
    }
  }, [routes, selectedId, mapReady, onSelect, onDeselect]);

  return <div ref={containerRef} className="w-full h-full" />;
}
