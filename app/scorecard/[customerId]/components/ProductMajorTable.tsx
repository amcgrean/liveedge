'use client';

import React, { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import type { ProductMajorRow, ProductMinorRow, ScorecardParams } from '@/lib/scorecard/types';

function fmt$(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(sales: number, gp: number): string {
  if (sales === 0) return '—';
  return `${((gp / sales) * 100).toFixed(2)}%`;
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-16 bg-slate-700 rounded-full h-1.5 ml-1 inline-block align-middle print:hidden">
      <div className="h-1.5 rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Props {
  rows: ProductMajorRow[];
  params: ScorecardParams;
  baseYear: number;
  compareYear: number;
  minorsApiPath?: string;                  // defaults to /api/scorecard/${customerId}
  extraParams?: Record<string, string>;    // additional query params for the minors fetch
}

export default function ProductMajorTable({ rows, params, baseYear, compareYear, minorsApiPath, extraParams }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [minors, setMinors] = useState<Record<string, ProductMinorRow[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const maxBase = Math.max(...rows.map((r) => r.salesBase), 1);

  const totalBase = rows.reduce((s, r) => s + r.salesBase, 0);
  const totalCompare = rows.reduce((s, r) => s + r.salesCompare, 0);
  const totalGpBase = rows.reduce((s, r) => s + r.gpBase, 0);
  const totalGpCompare = rows.reduce((s, r) => s + r.gpCompare, 0);

  async function toggleMinors(code: string) {
    if (expanded[code]) {
      setExpanded((p) => ({ ...p, [code]: false }));
      return;
    }
    if (minors[code]) {
      setExpanded((p) => ({ ...p, [code]: true }));
      return;
    }
    setLoading((p) => ({ ...p, [code]: true }));
    try {
      const sp = new URLSearchParams({
        majorCode: code,
        baseYear: String(params.baseYear),
        compareYear: String(params.compareYear),
        period: params.period,
        cutoffDate: params.cutoffDate,
      });
      params.branchIds.forEach((b) => sp.append('branch', b));
      if (extraParams) {
        Object.entries(extraParams).forEach(([k, v]) => sp.set(k, v));
      }
      const basePath = minorsApiPath ?? `/api/scorecard/${encodeURIComponent(params.customerId)}`;
      const res = await fetch(`${basePath}/minors?${sp}`);
      if (res.ok) {
        const data = await res.json() as { minors: ProductMinorRow[] };
        setMinors((p) => ({ ...p, [code]: data.minors }));
        setExpanded((p) => ({ ...p, [code]: true }));
      }
    } finally {
      setLoading((p) => ({ ...p, [code]: false }));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="pb-2 text-left text-slate-400 font-medium">Product Major</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} Sales</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} GP</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} GM%</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{compareYear} Sales</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{compareYear} GP</th>
            <th className="pb-2 text-right text-slate-300 font-semibold">{compareYear} GM%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <React.Fragment key={r.productMajorCode}>
              <tr
                className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer transition"
                onClick={() => toggleMinors(r.productMajorCode)}
              >
                <td className="py-2 text-slate-200 flex items-center gap-1">
                  {loading[r.productMajorCode]
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                    : (
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${
                          expanded[r.productMajorCode] ? 'rotate-90' : ''
                        }`}
                      />
                    )
                  }
                  <span>{r.productMajor}</span>
                  {r.salesBase > 0 && <MiniBar value={r.salesBase} max={maxBase} />}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(r.salesBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(r.gpBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-cyan-400 pr-3">{fmtPct(r.salesBase, r.gpBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(r.salesCompare)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(r.gpCompare)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-400">{fmtPct(r.salesCompare, r.gpCompare)}</td>
              </tr>

              {expanded[r.productMajorCode] && (minors[r.productMajorCode] ?? []).map((m) => (
                <tr
                  key={m.productMinorCode}
                  className="border-b border-slate-800/50 bg-slate-900/40"
                >
                  <td className="py-1.5 pl-7 text-slate-400 text-xs">{m.productMinor}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">{fmt$(m.salesBase)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">{fmt$(m.gpBase)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-cyan-500/70 text-xs pr-3">{fmtPct(m.salesBase, m.gpBase)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmt$(m.salesCompare)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmt$(m.gpCompare)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs">{fmtPct(m.salesCompare, m.gpCompare)}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}

          {/* Total row */}
          <tr className="border-t-2 border-slate-600 font-semibold">
            <td className="py-2 text-slate-100">Total</td>
            <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(totalBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(totalGpBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-cyan-400 pr-3">{fmtPct(totalBase, totalGpBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalCompare)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalGpCompare)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400">{fmtPct(totalCompare, totalGpCompare)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
