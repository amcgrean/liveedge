'use client';

import React, { useMemo, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import HouseLoader from '@/components/scorecard/HouseLoader';
import { SortableHeader, TableToolbar, useTableSort, type ColumnDef, type DrillConfig } from '@/components/data-table';
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

function deltaClass(base: number, compare: number): string {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-white';
}

function gmDeltaClass(salesBase: number, gpBase: number, salesCompare: number, gpCompare: number): string {
  const base = salesBase !== 0 ? (gpBase / salesBase) * 100 : null;
  const cmp  = salesCompare !== 0 ? (gpCompare / salesCompare) * 100 : null;
  if (base === null) return 'text-slate-300';
  if (cmp === null)  return 'text-emerald-400';
  if (base > cmp + 0.005) return 'text-emerald-400';
  if (base < cmp - 0.005) return 'text-red-400';
  return 'text-slate-300';
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
  orderFrom?: string;
  orderFromLabel?: string;
  exportFilename?: string;
}

export default function ProductMajorTable({ rows, params, baseYear, compareYear, minorsApiPath, extraParams, orderFrom, orderFromLabel, exportFilename }: Props) {
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

  // Columns drive sort + export. Cells continue to render via the existing
  // bespoke layout below — these defs are not used for display.
  const majorColumns: ColumnDef<ProductMajorRow>[] = useMemo(() => [
    { key: 'product_major', header: 'Product Major', accessor: (r) => `${r.productMajor} (${r.productMajorCode})` },
    { key: 'sales_base',    header: `${baseYear} Sales`, accessor: (r) => r.salesBase, align: 'right' },
    { key: 'gp_base',       header: `${baseYear} GP`,    accessor: (r) => r.gpBase,    align: 'right' },
    {
      key: 'gm_base',
      header: `${baseYear} GM%`,
      accessor: (r) => (r.salesBase === 0 ? null : (r.gpBase / r.salesBase) * 100),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
    { key: 'sales_compare', header: `${compareYear} Sales`, accessor: (r) => r.salesCompare, align: 'right' },
    { key: 'gp_compare',    header: `${compareYear} GP`,    accessor: (r) => r.gpCompare,    align: 'right' },
    {
      key: 'gm_compare',
      header: `${compareYear} GM%`,
      accessor: (r) => (r.salesCompare === 0 ? null : (r.gpCompare / r.salesCompare) * 100),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
  ], [baseYear, compareYear]);

  const minorColumns: ColumnDef<ProductMinorRow>[] = useMemo(() => [
    { key: 'product_minor', header: 'Product Minor', accessor: (m) => `${m.productMinor} (${m.productMinorCode})` },
    { key: 'sales_base',    header: `${baseYear} Sales`, accessor: (m) => m.salesBase, align: 'right' },
    { key: 'gp_base',       header: `${baseYear} GP`,    accessor: (m) => m.gpBase,    align: 'right' },
    {
      key: 'gm_base',
      header: `${baseYear} GM%`,
      accessor: (m) => (m.salesBase === 0 ? null : (m.gpBase / m.salesBase) * 100),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
    { key: 'sales_compare', header: `${compareYear} Sales`, accessor: (m) => m.salesCompare, align: 'right' },
    { key: 'gp_compare',    header: `${compareYear} GP`,    accessor: (m) => m.gpCompare,    align: 'right' },
    {
      key: 'gm_compare',
      header: `${compareYear} GM%`,
      accessor: (m) => (m.salesCompare === 0 ? null : (m.gpCompare / m.salesCompare) * 100),
      exportFormat: (v) => (v === null || v === undefined ? '' : `${(v as number).toFixed(2)}%`),
      align: 'right',
    },
  ], [baseYear, compareYear]);

  // "Copy with Minors" reuses the same /minors endpoint the table already
  // calls on chevron expand. Cached results are reused; only un-fetched
  // parents hit the network.
  const drillConfig: DrillConfig<ProductMajorRow, ProductMinorRow> = useMemo(() => ({
    label: 'Minors',
    columns: minorColumns,
    rowKey: (m) => m.productMinorCode,
    fetchChildren: async (row, signal) => {
      if (minors[row.productMajorCode]) return minors[row.productMajorCode];
      const res = await fetch(`${basePath}/minors?${buildSp({ majorCode: row.productMajorCode })}`, { signal });
      if (!res.ok) return [];
      const data = (await res.json()) as { minors: ProductMinorRow[] };
      // Cache for subsequent expand clicks too.
      setMinors((p) => ({ ...p, [row.productMajorCode]: data.minors }));
      return data.minors;
    },
  }), [basePath, minors, minorColumns]); // buildSp is stable per render via params

  const { sortedRows, sort, toggle } = useTableSort({ rows, columns: majorColumns });

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <TableToolbar
          rows={sortedRows}
          columns={majorColumns}
          drill={drillConfig}
          filename={exportFilename ?? `product-majors-${baseYear}`}
        />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm print:text-xs">
        <thead>
          <tr className="border-b border-slate-700 group">
            <SortableHeader columnKey="product_major" label="Product Major" sort={sort} onToggle={toggle} align="left"  className="pb-2 text-left text-slate-400 font-medium" />
            <SortableHeader columnKey="sales_base"    label={`${baseYear} Sales`}    sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold pr-3" />
            <SortableHeader columnKey="gp_base"       label={`${baseYear} GP`}       sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold pr-3" />
            <SortableHeader columnKey="gm_base"       label={`${baseYear} GM%`}      sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold pr-3" />
            <SortableHeader columnKey="sales_compare" label={`${compareYear} Sales`} sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold pr-3" />
            <SortableHeader columnKey="gp_compare"    label={`${compareYear} GP`}    sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold pr-3" />
            <SortableHeader columnKey="gm_compare"    label={`${compareYear} GM%`}   sort={sort} onToggle={toggle} align="right" className="pb-2 text-right text-slate-300 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
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
                  <span className="text-slate-500 italic text-xs ml-0.5">({r.productMajorCode})</span>
                </td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(r.salesBase, r.salesCompare)}`}>{fmt$(r.salesBase)}</td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(r.gpBase, r.gpCompare)}`}>{fmt$(r.gpBase)}</td>
                <td className={`py-2 text-right font-mono tabular-nums pr-3 ${gmDeltaClass(r.salesBase, r.gpBase, r.salesCompare, r.gpCompare)}`}>{fmtPct(r.salesBase, r.gpBase)}</td>
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
                        <span>{m.productMinor}</span>
                        <span className="text-slate-500 italic ml-0.5">({m.productMinorCode})</span>
                      </td>
                      <td className={`py-1.5 text-right font-mono tabular-nums text-xs pr-3 ${deltaClass(m.salesBase, m.salesCompare)}`}>{fmt$(m.salesBase)}</td>
                      <td className={`py-1.5 text-right font-mono tabular-nums text-xs pr-3 ${deltaClass(m.gpBase, m.gpCompare)}`}>{fmt$(m.gpBase)}</td>
                      <td className={`py-1.5 text-right font-mono tabular-nums text-xs pr-3 ${gmDeltaClass(m.salesBase, m.gpBase, m.salesCompare, m.gpCompare)}`}>{fmtPct(m.salesBase, m.gpBase)}</td>
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
                                                href={`/sales/orders/${o.soNumber}${orderFrom ? `?from=${encodeURIComponent(orderFrom)}${orderFromLabel ? `&fromLabel=${encodeURIComponent(orderFromLabel)}` : ''}` : ''}`}
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
            <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(totalBase, totalCompare)}`}>{fmt$(totalBase)}</td>
            <td className={`py-2 text-right font-mono tabular-nums pr-3 ${deltaClass(totalGpBase, totalGpCompare)}`}>{fmt$(totalGpBase)}</td>
            <td className={`py-2 text-right font-mono tabular-nums pr-3 ${gmDeltaClass(totalBase, totalGpBase, totalCompare, totalGpCompare)}`}>{fmtPct(totalBase, totalGpBase)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalCompare)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400 pr-3">{fmt$(totalGpCompare)}</td>
            <td className="py-2 text-right font-mono tabular-nums text-slate-400">{fmtPct(totalCompare, totalGpCompare)}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
