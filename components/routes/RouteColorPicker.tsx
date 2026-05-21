'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#10b981', '#14b8a6', '#3b82f6', '#6366f1',
  '#8b5cf6', '#d946ef', '#ec4899', '#64748b',
];

interface RouteColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function RouteColorPicker({ value, onChange }: RouteColorPickerProps) {
  const [custom, setCustom] = useState('');

  const handleCustomChange = (hex: string) => {
    setCustom(hex);
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) onChange(hex);
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Route Color</Label>
      <div className="grid grid-cols-6 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
              value === c ? 'border-white ring-2 ring-offset-1 ring-foreground' : 'border-transparent'
            )}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-full border border-border flex-shrink-0"
          style={{ backgroundColor: value }}
        />
        <Input
          placeholder="#hex"
          value={custom || value}
          onChange={(e) => handleCustomChange(e.target.value)}
          className="h-8 text-xs font-mono"
          maxLength={7}
        />
      </div>
    </div>
  );
}
