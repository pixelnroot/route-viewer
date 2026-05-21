'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { Button } from './button';
import { Input } from './input';
import { Lock } from 'lucide-react';

export function AuthModal() {
  const { viewKey, setViewKey, clearKeys } = useAuthStore();
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Simple validation logic when key is provided
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch('/api/routes', {
        headers: {
          Authorization: `Bearer ${keyInput}`,
        },
      });
      if (res.ok) {
        setViewKey(keyInput);
      } else {
        setError('Invalid Basic Admin Key');
        clearKeys();
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    }
  };

  // Prevent hydration mismatch by returning null until mounted
  if (!isMounted) return null;

  // If we already have a key (and presumably it's valid from a previous session), don't show the modal
  if (viewKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 rounded-lg border bg-card shadow-lg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="p-3 bg-primary/10 rounded-full">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please enter the Basic Admin Key to view the map and routes.
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="w-full space-y-4 mt-2">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter Admin Key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              {error && <p className="text-xs text-destructive text-left">{error}</p>}
            </div>
            <Button type="submit" className="w-full">
              Unlock Dashboard
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
