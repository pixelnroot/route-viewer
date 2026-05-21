'use client';

import { useState } from 'react';
import { Menu, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import RouteSidebar from '@/components/sidebar/RouteSidebar';
import RouteBuilder from '@/components/routes/RouteBuilder';
import RouteDetailPanel from '@/components/routes/RouteDetailPanel';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';

// MapView must be client-side only — MapLibre/deck.gl need browser APIs
const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

export default function Home() {
  const { mode, selectedRouteId } = useRouteBuilderStore();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const showRightPanel = mode === 'create' || (mode === 'view' && selectedRouteId);

  return (
    <div className="flex h-full w-full overflow-hidden relative">
      {/* Left Sidebar */}
      {leftOpen ? (
        <div className="relative h-full z-10">
          <RouteSidebar />
          <Button 
            variant="secondary" 
            size="icon" 
            className="absolute top-4 -right-4 z-20 w-8 h-8 rounded-full shadow-md border"
            onClick={() => setLeftOpen(false)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Button 
          variant="secondary" 
          size="icon" 
          className="absolute top-4 left-4 z-20 w-10 h-10 shadow-md border rounded-md"
          onClick={() => setLeftOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Map — fills remaining space */}
      <div className="flex-1 relative">
        <MapView />
      </div>

      {/* Right panel */}
      {rightOpen && (
        <div className="relative h-full z-10">
          <Button 
            variant="secondary" 
            size="icon" 
            className="absolute top-4 -left-4 z-20 w-8 h-8 rounded-full shadow-md border"
            onClick={() => setRightOpen(false)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {mode === 'create' && <RouteBuilder />}
          {mode === 'view' && selectedRouteId && <RouteDetailPanel />}
          {mode === 'view' && !selectedRouteId && (
            <div className="flex flex-col items-center justify-center h-full bg-background border-l border-border w-80 text-center p-6">
              <div className="w-24 h-24 mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                <Image src="/globe.svg" alt="Logo" width={48} height={48} className="opacity-80 dark:invert" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Field Route Intelligence</h2>
              <p className="text-sm text-muted-foreground">
                Select a route from the sidebar to view its details, or create a new route.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Toggle button when right panel is collapsed */}
      {!rightOpen && (
        <Button 
          variant="secondary" 
          size="icon" 
          className="absolute top-4 right-4 z-20 w-10 h-10 shadow-md border rounded-md"
          onClick={() => setRightOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
}
