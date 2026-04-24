'use client';

import React, { useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import HouseLoader from '@/components/scorecard/HouseLoader';
import type {
  ProductMajorRow,
  ProductMinorRow,
  ProductItemRow,
  ProductOrderRow,
  ScorecardParams,
} from '@/lib/scorecard/types';

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

function fmtQty(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-16 bg-slate-700 rounded-full h-1.5 ml-1 inline-block align-middle print:hidden">
      <div className="h-1.5 rounded-full bg-cyan-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

function LoadingRow({ colSpan = 7, label }: { colSpan?: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-4">
        <div className="flex items-center justify-center gap-3 text-slate-500 text-xs">
          <HouseLoader size={38} />
          <span className="text-slate-600">{label}</span>
        </div>
      </td>
    </tr>
  );
}

interface Props {
  rows: ProductMajorRow[];
  params: ScorecardParams;
  baseYear: number;
  compareYear: number;
  minorsApiPath?: string;
  extraParams?: Record<string, string>;
}

export default function ProductMajorTable({ rows, params, baseYear, compareYear, minorsApiPath, extraParams }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [minors, setMinors] = useState<Record<string, ProductMinorRow[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [itemsData, setItemsData] = useState<Record<string, ProductItemRow[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [ordersData, setOrdersData] = useState<Record<string, ProductOrderRow[]>>({});
  const [loadingOrders, setLoadingOrders] = useState<Record<string, boolean>>({});

  const basePath = minorsApiPath ?? `/api/scorecard/${encodeURIComponent(params.customerId)}`;
  const ordersEnabled = !basePath.includes('aggregate');

  const maxBase = Math.max(...rows.map((r) => r.salesBase), 1);
  const totalBase = rows.reduce((s, r) => s + r.salesBase, 0);
  const totalCompare = rows.reduce((s, r) => s + r.salesCompare, 0);
  const totalGpBase = rows.reduce((s, r) => s + r.gpBase, 0);
  const totalGpCompare = rows.reduce((s, r) => s + r.gpCompare, 0);

  function buildSp(extra?: Record<string, string>): URLSearchParams {
    const sp = new URLSearchParams({
      baseYear: String(params.baseYear),
      compareYear: String(params.compareYear),
      period: params.period,
      cutoffDate: params.cutoffDate,
    });
    params.branchIds.forEach((b) => sp.append('branch', b));
    if (extraParams) Object.entries(extraParams).forEach(([k, v]) => sp.set(k, v));
    if (extra) Object.entries(extra).forEach(([k, v]) => sp.set(k, v));
    return sp;
  }

  async function toggleMinors(majorCode: string) {
    if (expanded[majorCode]) { setExpanded((p) => ({ ...p, [majorCode]: false })); return; }
    if (minors[majorCode]) { setExpanded((p) => ({ ...p, [majorCode]: true })); return; }
    setLoading((p) => ({ ...p, [majorCode]: true }));
    try {
      const res = await fetch(`${basePath}/minors?${buildSp({ majorCode })}`);
      if (res.ok) {
        const data = await res.json() as { minors: ProductMinorRow[] };
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
      const res = await fetch(`${basePath}/items?${buildSp({ majorCode, minorCode })}`);
      if (res.ok) {
        const data = await res.json() as { items: ProductItemRow[] };
        setItemsData((p) => ({ ...p, [key]: data.items }));
        setExpandedItems((p) => ({ ...p, [key]: true }));
      }
    } finally {
      setLoadingItems((p) => ({ ...p, [key]: false }));
    }
  }

  async function toggleOrders(majorCode: string, minorCode: string, itemNumber: string) {
    const key = `${majorCode}:${minorCode}:${itemNumber}`;
    if (expandedOrders[key]) { setExpandedOrders((p) => ({ ...p, [key]: false })); return; }
    if (ordersData[key]) { setExpandedOrders((p) => ({ ...p, [key]: true })); return; }
    setLoadingOrders((p) => ({ ...p, [key]: true }));
    try {
      const res = await fetch(`${basePath}/orders?${buildSp({ majorCode, minorCode, itemNumber })}`);
      if (res.ok) {
        const data = await res.json() as { orders: ProductOrderRow[] };
        setOrdersData((p) => ({ ...p, [key]: data.orders }));
        setExpandedOrders((p) => ({ ...p, [key]: true }));
      }
    } finally {
      setLoadingOrders((p) => ({ ...p, [key]: false }));
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

              {/* ── Major row ── */}
              <tr
                className="border-b border-slate-800 hover:bg-slate-800/30 cursor-pointer transition"
                onClick={() => toggleMinors(r.productMajorCode)}
              >
                <td className="py-2 text-slate-200 flex items-center gap-1">
                  {loading[r.productMajorCode]
                    ? <HouseLoader size={16} />
                    : (
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${expanded[r.productMajorCode] ? 'rotate-90' : ''}`} />
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

              {/* Loading placeholder — minors */}
              {loading[r.productMajorCode] && (
                <LoadingRow label="Loading product minors…" />
              )}

              {/* ── Minor rows ── */}
              {expanded[r.productMajorCode] && (minors[r.productMajorCode] ?? []).map((m) => {
                const minorKey = `${r.productMajorCode}:${m.productMinorCode}`;
                const minorItemsExpanded = expandedItems[minorKey];
                const minorItemsLoading = loadingItems[minorKey];
                return (
                  <React.Fragment key={m.productMinorCode}>
                    <tr
                      className="border-b border-slate-800/50 bg-slate-900/40 hover:bg-slate-800/20 cursor-pointer transition"
                      onClick={() => toggleItems(r.productMajorCode, m.productMinorCode)}
                    >
                      <td className="py-1.5 pl-7 text-slate-400 text-xs flex items-center gap-1">
                        {minorItemsLoading
                          ? <HouseLoader size={14} />
                          : (
                            <ChevronRight className={`w-3 h-3 text-slate-600 transition-transform shrink-0 ${minorItemsExpanded ? 'rotate-90' : ''}`} />
                          )
                        }
                        {m.productMinor}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">{fmt$(m.salesBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 text-xs pr-3">{fmt$(m.gpBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-cyan-500/70 text-xs pr-3">{fmtPct(m.salesBase, m.gpBase)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmt$(m.salesCompare)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs pr-3">{fmt$(m.gpCompare)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-500 text-xs">{fmtPct(m.salesCompare, m.gpCompare)}</td>
                    </tr>

                    {/* Loading placeholder — items */}
                    {minorItemsLoading && (
                      <LoadingRow label="Loading items…" />
                    )}

                    {/* ── Item rows ── */}
                    {minorItemsExpanded && (itemsData[minorKey] ?? []).map((item) => {
                      const itemKey = `${r.productMajorCode}:${m.productMinorCode}:${item.itemNumber}`;
                      const itemOrdersExpanded = expandedOrders[itemKey];
                      const itemOrdersLoading = loadingOrders[itemKey];
                      return (
                        <React.Fragment key={item.itemNumber}>
                          <tr
                            className={`border-b border-slate-800/30 bg-slate-950/60 ${ordersEnabled ? 'hover:bg-slate-800/10 cursor-pointer transition' : ''}`}
                            onClick={ordersEnabled ? () => toggleOrders(r.productMajorCode, m.productMinorCode, item.itemNumber) : undefined}
                          >
                            <td className="py-1 pl-14 text-slate-500 text-xs flex items-center gap-1">
                              {ordersEnabled && (
                                itemOrdersLoading
                                  ? <HouseLoader size={12} />
                                  : (
                                    <ChevronRight className={`w-2.5 h-2.5 text-slate-700 transition-transform shrink-0 ${itemOrdersExpanded ? 'rotate-90' : ''}`} />
                                  )
                              )}
                              <span className="text-slate-400">{item.itemDescription || item.itemNumber}</span>
                              {item.itemDescription && item.itemNumber && (
                                <span className="text-slate-600 ml-1">({item.itemNumber})</span>
                              )}
                              {item.qtyBase > 0 && (
                                <span className="text-slate-600 ml-2 tabular-nums">{fmtQty(item.qtyBase)} units</span>
                              )}
                            </td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">{fmt$(item.salesBase)}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-400 text-xs pr-3">{fmt$(item.gpBase)}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-cyan-600/60 text-xs pr-3">{fmtPct(item.salesBase, item.gpBase)}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs pr-3">{fmt$(item.salesCompare)}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs pr-3">{fmt$(item.gpCompare)}</td>
                            <td className="py-1 text-right font-mono tabular-nums text-slate-600 text-xs">{fmtPct(item.salesCompare, item.gpCompare)}</td>
                          </tr>

                          {/* Loading placeholder — orders */}
                          {itemOrdersLoading && (
                            <LoadingRow label="Loading orders…" />
                          )}

                          {/* ── Order rows ── */}
                          {itemOrdersExpanded && (
                            <tr className="border-b border-slate-800/20 bg-slate-950">
                              <td colSpan={7} className="py-0">
                                <div className="pl-16 pr-4 py-1.5">
                                  {(ordersData[itemKey] ?? []).length === 0 ? (
                                    <p className="text-xs text-slate-600 italic py-1">No orders found</p>
                                  ) : (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-slate-800">
                                          <th className="pb-1 text-left text-slate-600 font-medium">SO #</th>
                                          <th className="pb-1 text-left text-slate-600 font-medium">Date</th>
                                          <th className="pb-1 text-right text-slate-600 font-medium pr-3">Qty</th>
                                          <th className="pb-1 text-right text-slate-600 font-medium pr-3">Sales</th>
                                          <th className="pb-1 text-right text-slate-600 font-medium">GP</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(ordersData[itemKey] ?? []).map((o) => (
                                          <tr key={o.soNumber} className="border-b border-slate-900 hover:bg-slate-900/50 transition">
                                            <td className="py-0.5">
                                              <a
                                                href={`/sales/orders/${o.soNumber}`}
                                                className="text-cyan-600 hover:text-cyan-400 flex items-center gap-0.5 transition"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                {o.soNumber}
                                                <ExternalLink className="w-2.5 h-2.5" />
                                              </a>
                                            </td>
                                            <td className="py-0.5 text-slate-500">{o.invoiceDate}</td>
                                            <td className="py-0.5 text-right font-mono tabular-nums text-slate-500 pr-3">{fmtQty(o.qty)}</td>
                                            <td className="py-0.5 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(o.sales)}</td>
                                            <td className="py-0.5 text-right font-mono tabular-nums text-slate-500">{fmt$(o.gp)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
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
