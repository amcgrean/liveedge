'use client';

import React from 'react';
import { X, Trash2, Edit3 } from 'lucide-react';
import { formatMeasurement } from '@/lib/takeoff/calculations';
import type { MeasurementState, GroupState, ViewportState } from '@/hooks/useMeasurementReducer';

interface MeasurementInspectorProps {
  measurement: MeasurementState | null;
  group: GroupState | null;
  viewport: ViewportState | null;
  onClose: () => void;
  onDelete: (measurementId: string, pageNumber: number, groupId: string) => void;
  onUpdateNotes: (measurementId: string, pageNumber: number, notes: string) => void;
}

export function MeasurementInspector({
  measurement,
  group,
  viewport,
  onClose,
  onDelete,
  onUpdateNotes,
}: MeasurementInspectorProps) {
  if (!measurement) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-white/10 z-30 flex flex-col shadow-2xl animate-in slide-in-from-right">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-white">Measurement Details</h3>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Type */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Type</label>
          <div className="text-sm text-white capitalize mt-0.5">{measurement.type}</div>
        </div>

        {/* Group */}
        {group && (
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider">Group</label>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-sm text-white">{group.name}</span>
            </div>
          </div>
        )}

        {/* Value */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Value</label>
          <div className="text-lg font-mono font-bold text-cyan-400 mt-0.5">
            {formatMeasurement(measurement.calculatedValue, measurement.unit)}
          </div>
        </div>

        {/* Viewport / Scale */}
        {viewport && (
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider">Viewport / Scale</label>
            <div className="text-sm text-white mt-0.5">
              {viewport.name} — {viewport.scaleName || 'Not calibrated'}
            </div>
          </div>
        )}

        {/* Target field */}
        {group?.targetField && (
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider">Maps To</label>
            <div className="text-xs font-mono text-slate-400 mt-0.5 px-2 py-1 rounded bg-slate-800">
              {group.targetField}
            </div>
          </div>
        )}

        {/* Page */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Page</label>
          <div className="text-sm text-white mt-0.5">{measurement.pageNumber}</div>
        </div>

        {/* Created */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Created</label>
          <div className="text-sm text-slate-400 mt-0.5">
            {new Date(measurement.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Notes</label>
          <textarea
            value={measurement.notes}
            onChange={(e) => onUpdateNotes(measurement.id, measurement.pageNumber, e.target.value)}
            placeholder="Add notes..."
            className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-1 focus:ring-cyan-500"
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-white/10 flex gap-2">
        <button
          onClick={() => onDelete(measurement.id, measurement.pageNumber, measurement.groupId)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 border border-red-400/20 hover:bg-red-400/10 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
