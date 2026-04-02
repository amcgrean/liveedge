'use client';

import React, { useRef, useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { cn } from '@/lib/utils';

interface PageNavigatorProps {
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  pageCount: number;
  thumbnailSize?: number;
  onPageChange: (page: number) => void;
}

export function PageNavigator({
  pdf,
  currentPage,
  pageCount,
  thumbnailSize = 48,
  onPageChange,
}: PageNavigatorProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // Generate thumbnails lazily
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    async function generateThumbnails() {
      for (let i = 1; i <= Math.min(pageCount, 30); i++) {
        if (cancelled) break;
        if (thumbnails[i]) continue;
        try {
          const page = await pdf!.getPage(i);
          const viewport = page.getViewport({ scale: 0.15 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, canvas, viewport }).promise;
          if (!cancelled) {
            setThumbnails((prev) => ({ ...prev, [i]: canvas.toDataURL() }));
          }
        } catch {
          // Skip failed thumbnails
        }
      }
    }

    generateThumbnails();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageCount]);

  // Scroll active thumbnail into view
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-page="${currentPage}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentPage]);

  if (pageCount === 0) return null;

  return (
    <div className="h-full flex-shrink-0 border-b border-white/10 bg-slate-900/50">
      <div ref={scrollRef} className="h-full flex items-start gap-2 p-2 overflow-x-auto">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
          <button
            key={page}
            data-page={page}
            onClick={() => onPageChange(page)}
            className={cn(
              'flex-shrink-0 rounded-md overflow-hidden border-2 transition',
              page === currentPage
                ? 'border-cyan-400 ring-1 ring-cyan-400/30'
                : 'border-transparent hover:border-slate-600'
            )}
          >
            {thumbnails[page] ? (
              <img
                src={thumbnails[page]}
                alt={`Page ${page}`}
                className="object-cover bg-white"
                style={{ width: thumbnailSize * 1.33, height: thumbnailSize }}
              />
            ) : (
              <div
                className="bg-slate-800 flex items-center justify-center"
                style={{ width: thumbnailSize * 1.33, height: thumbnailSize }}
              >
                <span className="text-xs text-slate-500">{page}</span>
              </div>
            )}
            <div className="text-[10px] text-center py-0.5 text-slate-500">
              {page}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
