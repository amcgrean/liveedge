'use client';

import React from 'react';
import { Crosshair, Trash2, Edit3, Eye } from 'lucide-react';
import type { ViewportState } from '@/hooks/useMeasurementReducer';

interface ViewportManagerProps {
  viewports: ViewportState[];
  activeViewportId: string | null;
  onSelectViewport: (id: string) => void;
  onCalibrateViewport: (id: string) => void;
  onDeleteViewport: (id: string, pageNumber: number) => void;
}

export function ViewportManager({
  viewports,
  activeViewportId,
  onSelectViewport,
  onCalibrateViewport,
  onDeleteViewport,
}: ViewportManagerProps) {
  if (viewports.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-slate-500">
        No viewports on this page. Use the Viewport tool to define scale regions.
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {viewports.map((vp) => (
        <div
          key={vp.id}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition cursor-pointer ${
            vp.id === activeViewportId
              ? 'bg-cyan-500/10 text-white border border-cyan-500/20'
              : 'text-slate-400 hover:bg-slate-800/50'
          }`}
          onClick={() => onSelectViewport(vp.id)}
        >
          <Eye className="w-3.5 h-3.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{vp.name}</div>
            <div className="text-slate-500 truncate">
              {vp.scaleName || 'Not calibrated'}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onCalibrateViewport(vp.id); }}
            className="p-1 rounded text-slate-500 hover:text-cyan-400"
            title="Calibrate"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteViewport(vp.id, vp.pageNumber); }}
            className="p-1 rounded text-slate-500 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
