'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Download, Loader2 } from 'lucide-react';
import type { ColumnDef, DrillConfig } from './types';
import { rowsToCsv, rowsToTsv, downloadCsv, flattenForCopy } from './serialize';

interface Props<Row> {
  rows: Row[];
  columns: ColumnDef<Row>[];
  filename?: string;
  /**
   * Optional drill — adds a chevron to Copy with "Copy with [drill.label]".
   * Child type is intentionally opaque to the toolbar (copy flatten only
   * needs the children's accessor/header/exportFormat) so callers can pass
   * any DrillConfig<Row, X> without variance friction.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drill?: DrillConfig<Row, any>;
  /** Concurrency cap for parallel fetchChildren when copying with drill. */
  drillConcurrency?: number;
  className?: string;
  /** Right-aligned slot for page-specific filters / extra buttons. */
  children?: React.ReactNode;
}

/**
 * Reusable toolbar — Copy + CSV + (optional) drill-down chevron.
 *
 * Adopt this on bespoke tables (scorecard) without changing the table body.
 * The `<DataTable>` component embeds this internally.
 */
export default function TableToolbar<Row>({
  rows,
  columns,
  filename = 'export',
  drill,
  drillConcurrency = 8,
  className = '',
  children,
}: Props<Row>) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drillBusy, setDrillBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close drill menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function flashCopied() {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyCurrent() {
    setMenuOpen(false);
    const tsv = rowsToTsv(rows, columns);
    await navigator.clipboard.writeText(tsv);
    flashCopied();
  }

  async function copyWithDrill() {
    if (!drill) return;
    setMenuOpen(false);
    setDrillBusy(true);
    const controller = new AbortController();
    try {
      const map = new Map<Row, unknown[]>();
      // Bounded concurrency.
      let cursor = 0;
      const workers = Array.from({ length: Math.min(drillConcurrency, rows.length) }, async () => {
        while (cursor < rows.length) {
          const i = cursor++;
          const row = rows[i];
          try {
            const children = await drill.fetchChildren(row, controller.signal);
            map.set(row, children);
          } catch {
            map.set(row, []);
          }
        }
      });
      await Promise.all(workers);
      const tsv = flattenForCopy(rows, columns, map, drill.columns);
      await navigator.clipboard.writeText(tsv);
      flashCopied();
    } finally {
      setDrillBusy(false);
    }
  }

  function downloadCurrent() {
    const csv = rowsToCsv(rows, columns);
    downloadCsv(csv, filename);
  }

  return (
    <div className={`flex items-center gap-1 print:hidden ${className}`}>
      {children}

      {/* Copy + optional drill chevron */}
      <div className="relative inline-flex" ref={menuRef}>
        <button
          type="button"
          onClick={copyCurrent}
          disabled={drillBusy}
          title="Copy table to clipboard (paste into Excel)"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition disabled:opacity-50 disabled:cursor-wait ${drill ? 'rounded-l' : 'rounded'}`}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
        {drill && (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={drillBusy}
            title={`Copy options (with ${drill.label})`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="inline-flex items-center px-1.5 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition rounded-r border-l border-slate-600 disabled:opacity-50"
          >
            {drillBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
        {drill && menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-20 min-w-[12rem] rounded border border-slate-700 bg-slate-900 shadow-lg text-xs"
          >
            <button
              type="button"
              role="menuitem"
              onClick={copyCurrent}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
            >
              Copy current level
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={copyWithDrill}
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 border-t border-slate-800"
            >
              Copy with {drill.label}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={downloadCurrent}
        title="Download as CSV"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </button>
    </div>
  );
}
