'use client';

import React from 'react';
import { Stamp as StampIcon } from 'lucide-react';

export const STAMP_PRESETS = [
  { label: 'VERIFIED', color: '#22c55e' },
  { label: 'QUESTION', color: '#f59e0b' },
  { label: 'REVISION NEEDED', color: '#ef4444' },
  { label: 'APPROVED', color: '#3b82f6' },
  { label: 'HOLD', color: '#a855f7' },
] as const;

interface StampPickerProps {
  onSelect: (label: string, color: string) => void;
  onClose: () => void;
}

export function StampPicker({ onSelect, onClose }: StampPickerProps) {
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-3 w-56">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Stamps</div>
      <div className="space-y-1">
        {STAMP_PRESETS.map((stamp) => (
          <button
            key={stamp.label}
            onClick={() => {
              onSelect(stamp.label, stamp.color);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium hover:bg-slate-800 transition text-left"
            style={{ color: stamp.color }}
          >
            <StampIcon className="w-4 h-4" />
            {stamp.label}
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full mt-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 transition"
      >
        Cancel
      </button>
    </div>
  );
}
