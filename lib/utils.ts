import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nearestCoordIndex(coords: [number, number][], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  coords.forEach(([clng, clat], i) => {
    const d = (clat - lat) ** 2 + (clng - lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
