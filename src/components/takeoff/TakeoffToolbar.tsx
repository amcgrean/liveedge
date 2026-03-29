'use client';

import React from 'react';
import {
  MousePointer2, Square, Minus, Pentagon, Hash,
  Type, ArrowRight, RectangleHorizontal, Cloud, Stamp,
  Pencil, Crosshair, Save, Download, ChevronLeft,
  ChevronRight, ZoomIn, ZoomOut, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolType } from '@/hooks/useMeasurementReducer';

interface TakeoffToolbarProps {
  sessionName: string;
  currentPage: number;
  pageCount: number;
  zoom: number;
  activeTool: ToolType;
  activeViewportScale: string | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSetTool: (tool: ToolType) => void;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
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
  currentPage,
  pageCount,
  zoom,
  activeTool,
  activeViewportScale,
  isDirty,
  canUndo,
  canRedo,
  onSetTool,
  onPageChange,
  onZoomChange,
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
          <span className="text-sm font-medium text-white truncate max-w-[200px]">
            {sessionName || 'Untitled Session'}
          </span>
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved</span>
          )}
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-300 min-w-[80px] text-center">
            Page {currentPage} of {pageCount || '—'}
          </span>
          <button
            onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
            disabled={currentPage >= pageCount}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom + actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onZoomChange(Math.max(0.1, zoom - 0.25))}
            className="p-1 rounded text-slate-400 hover:text-white"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 min-w-[40px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(10, zoom + 0.25))}
            className="p-1 rounded text-slate-400 hover:text-white"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <span className="text-xs">↩</span>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <span className="text-xs">↪</span>
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          <button
            onClick={onSave}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800"
            title="Save"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onExport('csv')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-white hover:bg-slate-800"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onSendToEstimate}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
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

        {/* Active viewport scale display */}
        {activeViewportScale && (
          <div className="ml-2 px-2 py-1 rounded bg-slate-800 text-xs text-cyan-400 border border-cyan-500/20">
            {activeViewportScale}
          </div>
        )}
      </div>
    </div>
  );
}
