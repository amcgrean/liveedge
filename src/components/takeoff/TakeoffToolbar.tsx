'use client';

import React from 'react';
import {
  MousePointer2, Square, Minus, Pentagon, Hash,
  Type, ArrowRight, RectangleHorizontal, Cloud, Stamp,
  Pencil, Crosshair, Save, Download, Send, Undo2, Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolType } from '@/hooks/useMeasurementReducer';

interface TakeoffToolbarProps {
  sessionName: string;
  activeTool: ToolType;
  activeViewportScale: string | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSetTool: (tool: ToolType) => void;
  onSave: () => void;
  onExport: (type: 'csv' | 'pdf') => void;
  onSendToEstimate: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  tool: ToolType;
  activeTool: ToolType;
  onClick: (tool: ToolType) => void;
}

function ToolButton({ icon, label, tool, activeTool, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={() => onClick(tool)}
      title={label}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition',
        activeTool === tool
          ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

export function TakeoffToolbar({
  sessionName,
  activeTool,
  activeViewportScale,
  isDirty,
  canUndo,
  canRedo,
  onSetTool,
  onSave,
  onExport,
  onSendToEstimate,
  onUndo,
  onRedo,
}: TakeoffToolbarProps) {
  return (
    <div className="flex-shrink-0 border-b border-white/10 bg-slate-950/95 backdrop-blur-sm">
      {/* Top info bar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white truncate max-w-[260px]">
            {sessionName || 'Untitled Session'}
          </span>
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button
            onClick={onSave}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Save (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            onClick={() => onExport('csv')}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={onSendToEstimate}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition"
            title="Send to Estimate"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Send to Estimate</span>
          </button>
        </div>
      </div>

      {/* Tool bar */}
      <div className="flex items-center gap-1 px-3 h-10 overflow-x-auto">
        <ToolButton icon={<MousePointer2 className="w-4 h-4" />} label="Select" tool="select" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Square className="w-4 h-4" />} label="Viewport" tool="viewport" activeTool={activeTool} onClick={onSetTool} />

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <ToolButton icon={<Minus className="w-4 h-4" />} label="Linear" tool="polyline" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Pentagon className="w-4 h-4" />} label="Area" tool="polygon" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Hash className="w-4 h-4" />} label="Count" tool="count" activeTool={activeTool} onClick={onSetTool} />

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <ToolButton icon={<Type className="w-4 h-4" />} label="Text" tool="text" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<ArrowRight className="w-4 h-4" />} label="Arrow" tool="arrow" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<RectangleHorizontal className="w-4 h-4" />} label="Rect" tool="rectangle" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Cloud className="w-4 h-4" />} label="Cloud" tool="cloud" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Stamp className="w-4 h-4" />} label="Stamp" tool="stamp" activeTool={activeTool} onClick={onSetTool} />
        <ToolButton icon={<Pencil className="w-4 h-4" />} label="Draw" tool="freehand" activeTool={activeTool} onClick={onSetTool} />

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <ToolButton icon={<Crosshair className="w-4 h-4" />} label="Calibrate" tool="calibrate" activeTool={activeTool} onClick={onSetTool} />

        {activeViewportScale && (
          <div className="ml-2 px-2 py-1 rounded bg-slate-800 text-xs text-cyan-400 border border-cyan-500/20">
            {activeViewportScale}
          </div>
        )}
      </div>
    </div>
  );
}
