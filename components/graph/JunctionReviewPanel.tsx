'use client';

import { useState } from 'react';
import { GitBranch, Check, X, MapPin, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGraphStore } from '@/lib/store/graph-store';
import { useRouteBuilderStore } from '@/lib/store/route-builder-store';
import { useAuthStore } from '@/lib/store/auth-store';
import type { SavedRoute } from '@/types/routes';

/**
 * Renders after RouteBuilder compiles a draft that touches other routes.
 * The admin accepts/rejects each detected junction, then applies.
 */
export default function JunctionReviewPanel({ onApplied, onCancel }: {
  onApplied: (saved: SavedRoute) => void;
  onCancel: () => void;
}) {
  const { editKey } = useAuthStore();
  const flyTo = useRouteBuilderStore((s) => s.flyTo);
  const { pendingCompile, setProposalDecision, setPendingCompile } = useGraphStore();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pendingCompile) return null;
  const { draft, result, decisions } = pendingCompile;
  const acceptedCount = result.proposals.filter((p) => decisions[p.id]).length;

  const handleApply = async () => {
    setIsApplying(true);
    setError(null);
    try {
      const accepted = result.proposals.filter((p) => decisions[p.id]);
      const res = await fetch('/api/graph/subroutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editKey}` },
        body: JSON.stringify({ draft, acceptedProposals: accepted }),
      });
      if (!res.ok) throw new Error(`Apply failed: ${res.status}`);
      const data = await res.json();
      setPendingCompile(null);
      onApplied(data.savedRoute as SavedRoute);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/5">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold">
          {result.proposals.length} junction{result.proposals.length === 1 ? '' : 's'} detected
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        This route passes close to existing roads. Accept a junction to connect them for navigation; reject if it is a parallel road, not a real crossing.
      </p>

      <div className="space-y-2 max-h-56 overflow-y-auto">
        {result.proposals.map((p) => {
          const accepted = decisions[p.id];
          return (
            <div key={p.id} className={cn('rounded-lg border p-2 text-xs space-y-1.5', accepted ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-muted/30')}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{p.existingSubrouteNames.join(', ')}</span>
                <span className="text-muted-foreground flex-shrink-0">{p.distM} m</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => flyTo(p.atExisting.lat, p.atExisting.lng)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground px-1.5 py-1 rounded border border-border"
                >
                  <MapPin className="w-3 h-3" /> Show
                </button>
                <button
                  type="button"
                  onClick={() => setProposalDecision(p.id, true)}
                  className={cn('flex items-center gap-1 px-1.5 py-1 rounded border', accepted ? 'border-green-500 text-green-600 bg-green-500/10' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  <Check className="w-3 h-3" /> Connect
                </button>
                <button
                  type="button"
                  onClick={() => setProposalDecision(p.id, false)}
                  className={cn('flex items-center gap-1 px-1.5 py-1 rounded border', !accepted ? 'border-red-500 text-red-600 bg-red-500/10' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  <X className="w-3 h-3" /> Skip
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-2.5 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleApply} disabled={isApplying}>
          {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
          Save with {acceptedCount} junction{acceptedCount === 1 ? '' : 's'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setPendingCompile(null); onCancel(); }} disabled={isApplying}>
          Back
        </Button>
      </div>
    </div>
  );
}
