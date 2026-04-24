'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import HouseLoader from '@/components/scorecard/HouseLoader';
import type {
  ProductScorecardMajorRow,
  ProductScorecardMinorRow,
  ProductScorecardItemRow,
  AggregateParams,
} from '@/lib/scorecard/types';

function fmt$(n: number) {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number, gp: number) {
  if (sales === 0) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
}

function fmtN(n: number) {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
}

function delta(base: number, compare: number) {
  if (compare === 0) return null;
  const pct = ((base - compare) / Math.abs(compare)) * 100;
  const cls = pct >= 0 ? 'text-emerald-400' : 'text-red-400';
  const sign = pct >= 0 ? '+' : '';
  return <span className={`text-xs ml-1 ${cls}`}>{sign}{pct.toFixed(1)}%</span>;
}


function LoadingRow() {
  return (
    <tr>
      <td colSpan={9} className="py-4">
        <div className="flex items-center justify-center gap-3 text-slate-500 text-xs">
          <HouseLoader size={38} />
          <span className="text-slate-600">Loading…</span>
        </div>
      </td>
    </tr>
  );
}

interface Props {
  rows: ProductScorecardMajorRow[];
  params: AggregateParams;
  baseYear: number;
  compareYear: number;
}

export default function ProductScorecardTable({ rows, params, baseYear, compareYear }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [minors, setMinors] = useState<Record<string, ProductScorecardMinorRow[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [itemsData, setItemsData] = useState<Record<string, ProductScorecardItemRow[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

  const totalSalesBase = rows.reduce((s, r) => s + r.salesBase, 0);
  const totalGpBase = rows.reduce((s, r) => s + r.gpBase, 0);
  const totalSoBase = rows.reduce((s, r) => s + r.soCountBase, 0);
  const totalCrBase = rows.reduce((s, r) => s + r.creditCountBase, 0);
  const totalQtyBase = rows.reduce((s, r) => s + r.qtyBase, 0);
  const totalSalesCmp = rows.reduce((s, r) => s + r.salesCompare, 0);
  const totalGpCmp = rows.reduce((s, r) => s + r.gpCompare, 0);

  function buildSp(extra: Record<string, string>): URLSearchParams {
    const sp = new URLSearchParams({
      baseYear: String(params.baseYear),
      compareYear: String(params.compareYear),
      period: params.period,
      cutoffDate: params.cutoffDate,
    });
    params.branchIds.forEach((b) => sp.append('branch', b));
    Object.entries(extra).forEach(([k, v]) => sp.set(k, v));
    return sp;
  }

  async function toggleMinors(majorCode: string) {
    if (expanded[majorCode]) { setExpanded((p) => ({ ...p, [majorCode]: false })); return; }
    if (minors[majorCode]) { setExpanded((p) => ({ ...p, [majorCode]: true })); return; }
    setLoading((p) => ({ ...p, [majorCode]: true }));
    try {
      const res = await fetch(`/api/scorecard/product/minors?${buildSp({ majorCode })}`);
      if (res.ok) {
        const data = await res.json() as { minors: ProductScorecardMinorRow[] };
        setMinors((p) => ({ ...p, [majorCode]: data.minors }));
        setExpanded((p) => ({ ...p, [majorCode]: true }));
      }
    } finally {
      setLoading((p) => ({ ...p, [majorCode]: false }));
    }
  }

  async function toggleItems(majorCode: string, minorCode: string) {
    const key = `${majorCode}:${minorCode}`;
    if (expandedItems[key]) { setExpandedItems((p) => ({ ...p, [key]: false })); return; }
    if (itemsData[key]) { setExpandedItems((p) => ({ ...p, [key]: true })); return; }
    setLoadingItems((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`/api/scorecard/product/items?${buildSp({ majorCode, minorCode })}`);
      if (res.ok) {
        const data = await res.json() as { items: ProductScorecardItemRow[] };
        setItemsData((p) => ({ ...p, [key]: data.items }));
        setExpandedItems((p) => ({ ...p, [key]: true }));
      }
    } finally {
      setLoadingItems((p) => ({ ...p, [key]: false }));
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-xs">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="pb-2 text-left text-slate-400 font-medium w-56">Product Group</th>
            {/* Base year */}
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} Sales</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} GP</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">{baseYear} GM%</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">SOs</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">Credits</th>
            <th className="pb-2 text-right text-slate-300 font-semibold pr-3">Qty Sold</th>
            {/* Compare year */}
            <th className="pb-2 text-right text-slate-400 font-medium pr-3">{compareYear} Sales</th>
            <th className="pb-2 text-right text-slate-400 font-medium">{compareYear} GM%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <React.Fragment key={r.productMajorCode}>

              {/* ── Major row ── */}
              <tr
                className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer transition"
                onClick={() => toggleMinors(r.productMajorCode)}
              >
                <td className="py-2 text-slate-200 flex items-center gap-1">
                  {loading[r.productMajorCode]
                    ? <HouseLoader size={16} />
                    : <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${expanded[r.productMajorCode] ? 'rotate-90' : ''}`} />
                  }
                  <span className="truncate">{r.productMajor}</span>
                  <span className="text-slate-500 italic text-xs ml-0.5 shrink-0">({r.productMajorCode})</span>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-white pr-3">
                  {fmt$(r.salesBase)}{delta(r.salesBase, r.salesCompare)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(r.gpBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-cyan-400 pr-3">{fmtPct(r.salesBase, r.gpBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-300 pr-3">{fmtN(r.soCountBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums pr-3">
                  <span className={r.creditCountBase > 0 ? 'text-amber-400' : 'text-slate-600'}>{fmtN(r.creditCountBase)}</span>
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-300 pr-3">{fmtN(r.qtyBase)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-500 pr-3">{fmt$(r.salesCompare)}</td>
                <td className="py-2 text-right font-mono tabular-nums text-slate-500">{fmtPct(r.salesCompare, r.gpCompare)}</td>
              </tr>

              {loading[r.productMajorCode] && <LoadingRow />}

              {/* ── Minor rows ── */}
              {expanded[r.productMajorCode] && (minors[r.productMajorCode] ?? []).map((m) => {
                const minorKey = `${r.productMajorCode}:${m.productMinorCode}`;
                const minorExpanded = expandedItems[minorKey];
                const minorLoading = loadingItems[minorKey];
                return (
                  <React.Fragment key={m.productMinorCode}>
                    <tr
                      className="border-b border-slate-800/50 bg-slate-900/40 hover:bg-slate-800/20 cursor-pointer transition"
                      onClick={() => toggleItems(r.productMajorCode, m.productMinorCode)}
                    >
                      <td className="py-1.5 pl-7 text-slate-400 text-xs flex items-center gap-1">
                        {minorLoading
                          ? <HouseLoader size={14} />
                          : <ChevronRight className={`w-3 h-3 text-slate-600 transition-transform shrink-0 ${minorExpanded ? 'rotate-90' : ''}`} />
                        }
                        <span className="truncate">{m.productMinor}</span>
                        <span className="text-slate-500 italic ml-0.5 shrink-0">({m.productMinorCode})</span>
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">
                        {fmt$(m.salesBase)}{delta(m.salesBase, m.salesCompare)}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">{fmt$(m.gpBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-cyan-500/70 text-xs pr-3">{fmtPct(m.salesBase, m.gpBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">{fmtN(m.soCountBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-xs pr-3">
                        <span className={m.creditCountBase > 0 ? 'text-amber-500/70' : 'text-slate-600'}>{fmtN(m.creditCountBase)}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">{fmtN(m.qtyBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-600 text-xs pr-3">{fmt$(m.salesCompare)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-600 text-xs">{fmtPct(m.salesCompare, m.gpCompare)}</td>
                    </tr>

                    {minorLoading && <LoadingRow />}

                    {/* ── Item rows ── */}
                    {minorExpanded && (itemsData[minorKey] ?? []).map((item) => (
                      <tr
                        key={item.itemNumber}
                        className="border-b border-slate-800/30 bg-slate-950/60"
                      >
                        <td className="py-1 pl-14 text-xs flex items-center gap-1">
                          <span className="text-slate-400 truncate">{item.itemDescription || item.itemNumber}</span>
                          {item.itemDescription && item.itemNumber && (
                            <span className="text-slate-600 shrink-0">({item.itemNumber})</span>
                          )}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">
                          {fmt$(item.salesBase)}{delta(item.salesBase, item.salesCompare)}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">{fmt$(item.gpBase)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-cyan-600/60 text-xs pr-3">{fmtPct(item.salesBase, item.gpBase)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmtN(item.soCountBase)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs pr-3">—</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmtN(item.qtyBase)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs pr-3">{fmt$(item.salesCompare)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs">—</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          ))}

          {/* Totals */}
          <tr className="border-t-2 border-slate-600 font-semibold">
            <td className="py-2 text-slate-100">Total</td>
            <td className="py-2 text-right font-mono tabular-nums text-white pr-3">
              {fmt$(totalSalesBase)}{delta(totalSalesBase, totalSalesCmp)}
            </td>
            <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(totalGpBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-cyan-400 pr-3">{fmtPct(totalSalesBase, totalGpBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-300 pr-3">{fmtN(totalSoBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums pr-3">
              <span className={totalCrBase > 0 ? 'text-amber-400' : 'text-slate-600'}>{fmtN(totalCrBase)}</span>
            </td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-300 pr-3">{fmtN(totalQtyBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-500 pr-3">{fmt$(totalSalesCmp)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-500">{fmtPct(totalSalesCmp, totalGpCmp)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
