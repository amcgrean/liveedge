'use client';

import React, { useState } from 'react';
import { X, Crosshair } from 'lucide-react';
import { SCALE_PRESETS, pixelsPerUnitFromScale } from '@/lib/takeoff/calculations';

interface ScaleCalibrationProps {
  viewportName: string;
  onApplyPreset: (scaleName: string, pixelsPerUnit: number, presetKey: string) => void;
  onStartManualCalibration: () => void;
  onClose: () => void;
}

export function ScaleCalibration({
  viewportName,
  onApplyPreset,
  onStartManualCalibration,
  onClose,
}: ScaleCalibrationProps) {
  const [renderDPI, setRenderDPI] = useState(108); // 72 * 1.5 (default render scale)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-96 bg-slate-900 border border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-medium text-white">Calibrate Scale</h3>
            <p className="text-xs text-slate-500 mt-0.5">{viewportName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scale presets */}
        <div className="p-4 space-y-3">
          <label className="text-xs text-slate-400 uppercase tracking-wider">
            Standard Scales
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {SCALE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() =>
                  onApplyPreset(
                    preset.name,
                    pixelsPerUnitFromScale(preset.ratio, renderDPI),
                    preset.name
                  )
                }
                className="px-3 py-2 rounded-lg text-xs text-left text-slate-300 border border-white/10 hover:bg-slate-800 hover:text-white hover:border-cyan-500/30 transition"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {/* Manual calibration */}
          <button
            onClick={onStartManualCalibration}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/10 transition"
          >
            <Crosshair className="w-4 h-4" />
            Calibrate by Clicking Two Points
          </button>

          <p className="text-xs text-slate-600 text-center">
            Click two points on a known dimension, then enter the real-world distance.
          </p>
        </div>
      </div>
    </div>
  );
}
