'use client';

import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Layers, ScanLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomBarProps {
  currentPage: number;
  pageCount: number;
  zoom: number;
  scrollMode: 'zoom' | 'pan';
  showThumbnails: boolean;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onToggleScrollMode: () => void;
  onToggleThumbnails: () => void;
}

export function BottomBar({
  currentPage,
  pageCount,
  zoom,
  scrollMode,
  showThumbnails,
  onPageChange,
  onZoomChange,
  onToggleScrollMode,
  onToggleThumbnails,
}: BottomBarProps) {
  const [pageInput, setPageInput] = useState('');
  const [editing, setEditing] = useState(false);

  function handlePageSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= pageCount) {
      onPageChange(n);
    }
    setEditing(false);
    setPageInput('');
  }

  return (
    <div className="flex-shrink-0 h-9 border-t border-white/10 bg-slate-950/95 backdrop-blur-sm flex items-center justify-between px-3 select-none">
      {/* Left: thumbnails toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleThumbnails}
          title={showThumbnails ? 'Hide page strip' : 'Show page strip'}
          className={cn(
            'p-1.5 rounded text-xs transition',
            showThumbnails
              ? 'text-cyan-400 bg-cyan-500/15'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          )}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center: page navigation */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {editing ? (
          <form onSubmit={handlePageSubmit} className="flex items-center">
            <input
              autoFocus
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageSubmit}
              className="w-10 px-1 py-0.5 rounded bg-slate-800 border border-cyan-500/40 text-xs text-white text-center outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => { setEditing(true); setPageInput(String(currentPage)); }}
            className="text-xs text-slate-300 hover:text-white min-w-[72px] text-center tabular-nums"
            title="Click to jump to page"
          >
            {pageCount > 0 ? `${currentPage} of ${pageCount}` : '—'}
          </button>
        )}

        <button
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Right: zoom + scroll mode */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onZoomChange(Math.max(0.1, zoom - 0.25))}
          className="p-1 rounded text-slate-500 hover:text-white transition"
          title="Zoom out (Ctrl+Scroll)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs text-slate-400 tabular-nums min-w-[38px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(10, zoom + 0.25))}
          className="p-1 rounded text-slate-500 hover:text-white transition"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-slate-700 mx-1" />

        <button
          onClick={onToggleScrollMode}
          title={scrollMode === 'zoom' ? 'Scroll zooms — click to switch to scroll pans' : 'Scroll pans — click to switch to scroll zooms'}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-xs transition',
            scrollMode === 'zoom'
              ? 'text-cyan-400 bg-cyan-500/15'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <ScanLine className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{scrollMode === 'zoom' ? 'Zoom' : 'Scroll'}</span>
        </button>
      </div>
    </div>
  );
}
