'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, RefreshCw, ChevronLeft, Truck, Layers, AlertTriangle, BarChart3,
} from 'lucide-react';
import type { ForecastPayload, Branch, OpenOrderRow, ForecastDayRow } from '../../../src/lib/forecast/types';
import { usePageTracking } from '@/hooks/usePageTracking';
import {
  TimeSeriesChart,
  ParetoChart,
  CHART_COLORS,
} from '@/components/charts';
import {
  SortableHeader,
  TableToolbar,
  useTableSort,
  type ColumnDef,
} from '@/components/data-table';

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
}

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const BRANCH_OPTIONS = [
  { value: '',     label: 'All Branches' },
  { value: '10FD', label: 'Fort Dodge' },
  { value: '20GR', label: 'Grimes' },
  { value: '25BW', label: 'Birchwood' },
  { value: '40CV', label: 'Coralville' },
];

const DAYS_OPTIONS = [7, 14, 30] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3">
      {children}
    </h2>
  );
}

function fmtDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function isWeekend(s: string): boolean {
  const d = new Date(s + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

export default function ForecastClient({ isAdmin, userBranch }: Props) {
  usePageTracking();
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [branch, setBranch] = useState(isAdmin ? '' : (userBranch ?? ''));
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (branch) params.set('branch', branch);
      const res = await fetch(`/api/management/forecast?${params}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData((await res.json()) as ForecastPayload);
    } catch (e) {
      setError(`Failed to load forecast. ${e instanceof Error ? e.message : ''}`);
    } finally {
      setLoading(false);
    }
  }, [days, branch]);

  useEffect(() => { load(); }, [load]);

  const branchLabel = BRANCH_OPTIONS.find((b) => b.value === branch)?.label ?? 'All Branches';
  const branchesShown: Branch[] = branch
    ? [branch as Branch]
    : (data?.branches ?? ([] as readonly Branch[])).slice() as Branch[];

  // F2: Pareto data — open orders by sale type, sorted desc, value = total across visible branches.
  const openOrdersPareto = useMemo(() => {
    if (!data) return [];
    return data.open_orders.rows
      .map((row) => ({ label: row.sale_type, value: row.total }))
      .filter((r) => r.value > 0);
  }, [data]);

  // F1: Stacked-by-branch forecast time series — one row per day, one numeric column per visible branch.
  const { forecastStacked, forecastSeries } = useMemo(() => {
    if (!data || branchesShown.length === 0) {
      return { forecastStacked: [], forecastSeries: [] };
    }
    const stacked = data.forecast.days.map((d) => {
      const row: { date: string; [k: string]: number | string } = { date: d.date };
      for (const b of branchesShown) row[b] = d.by_branch[b] ?? 0;
      return row;
    });
    const series = branchesShown.map((b) => ({
      key: b,
      label: BRANCH_LABELS[b] ?? b,
      color: CHART_COLORS.branch[b] ?? CHART_COLORS.categorical[0],
    }));
    return { forecastStacked: stacked, forecastSeries: series };
  }, [data, branchesShown]);

  // Dynamic ColumnDef arrays for the two pivot tables. Branch + ship-via
  // columns come from the live data, so they're rebuilt whenever the filter
  // changes. Used by both the visible sortable headers and the export toolbar.
  const openOrdersColumns: ColumnDef<OpenOrderRow>[] = useMemo(() => [
    { key: 'sale_type', header: 'Sale Type', accessor: (r) => r.sale_type },
    ...branchesShown.map<ColumnDef<OpenOrderRow>>((b) => ({
      key: `branch_${b}`,
      header: BRANCH_LABELS[b] ?? b,
      accessor: (r) => r.by_branch[b] ?? 0,
      align: 'right',
    })),
    { key: 'total', header: 'Total', accessor: (r) => r.total, align: 'right' },
  ], [branchesShown]);

  const { sortedRows: sortedOpenOrders, sort: openSort, toggle: toggleOpen } = useTableSort({
    rows: data?.open_orders.rows ?? [],
    columns: openOrdersColumns,
  });

  const forecastColumns: ColumnDef<ForecastDayRow>[] = useMemo(() => {
    const shipVias = data?.ship_vias ?? [];
    return [
      { key: 'date', header: 'Date', accessor: (d) => d.date },
      ...branchesShown.map<ColumnDef<ForecastDayRow>>((b) => ({
        key: `branch_${b}`,
        header: BRANCH_LABELS[b] ?? b,
        accessor: (d) => d.by_branch[b] ?? 0,
        align: 'right',
      })),
      ...shipVias.map<ColumnDef<ForecastDayRow>>((sv) => ({
        key: `ship_via_${sv}`,
        header: `Ship Via: ${sv}`,
        accessor: (d) => d.by_ship_via[sv] ?? 0,
        align: 'right',
      })),
      { key: 'total', header: 'Day Total', accessor: (d) => d.total, align: 'right' },
    ];
  }, [data, branchesShown]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[110rem] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/management"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition mb-2"
          >
            <ChevronLeft className="w-3 h-3" />
            Management
          </Link>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-cyan-400" />
            Open Orders &amp; Delivery Forecast
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {branchLabel} · Forecast next {days} days
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  days === d ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {isAdmin && (
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:border-cyan-500"
            >
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={load}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:border-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700/60 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading forecast…</span>
        </div>
      )}

      {data && (
        <>
          {/* ── Open Orders by Sale Type × Branch ─────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>
                Open Orders by Sale Type · Includes Will-Call &amp; Direct · Excludes Hold
              </SectionTitle>
              <TableToolbar
                rows={sortedOpenOrders}
                columns={openOrdersColumns}
                filename={`open-orders-${branch || 'all'}`}
              />
            </div>

            {openOrdersPareto.length > 0 && (
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 mb-3 print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-white">
                    Open Orders Concentration
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    bars = open orders, line = cumulative %
                  </span>
                </div>
                <ParetoChart
                  rows={openOrdersPareto}
                  format={(n) => n.toLocaleString()}
                  valueLabel="Open Orders"
                  height={260}
                />
              </div>
            )}

            <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
              {data.open_orders.rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-slate-500 text-sm py-10">
                  <Layers className="w-5 h-5" />
                  No open orders found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/60">
                      <tr className="border-b border-slate-700 group">
                        <SortableHeader
                          columnKey="sale_type"
                          label="Sale Type"
                          sort={openSort}
                          onToggle={toggleOpen}
                          align="left"
                          className="px-4 py-2.5 text-left text-xs font-medium text-slate-400"
                        />
                        {branchesShown.map((b) => (
                          <SortableHeader
                            key={b}
                            columnKey={`branch_${b}`}
                            label={BRANCH_LABELS[b] ?? b}
                            sort={openSort}
                            onToggle={toggleOpen}
                            align="right"
                            className="px-4 py-2.5 text-right text-xs font-medium text-slate-400"
                          />
                        ))}
                        <SortableHeader
                          columnKey="total"
                          label="Total"
                          sort={openSort}
                          onToggle={toggleOpen}
                          align="right"
                          className="px-4 py-2.5 text-right text-xs font-semibold text-cyan-300 pr-4"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOpenOrders.map((row) => (
                        <tr
                          key={row.sale_type}
                          className="border-b border-slate-800 hover:bg-slate-800/40 transition"
                        >
                          <td className="px-4 py-2.5 font-medium text-white">{row.sale_type}</td>
                          {branchesShown.map((b) => (
                            <td
                              key={b}
                              className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-300"
                            >
                              {(row.by_branch[b] ?? 0).toLocaleString()}
                            </td>
                          ))}
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-cyan-300 pr-4">
                            {row.total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-900/60 font-semibold">
                        <td className="px-4 py-2.5 text-slate-300 uppercase text-xs tracking-wide">
                          Total
                        </td>
                        {branchesShown.map((b) => (
                          <td
                            key={b}
                            className="px-4 py-2.5 text-right font-mono tabular-nums text-white"
                          >
                            {(data.open_orders.branch_totals[b] ?? 0).toLocaleString()}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-cyan-300 pr-4">
                          {data.open_orders.grand_total.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* ── Delivery Forecast ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>
                Delivery Forecast · Next {days} Days · Excludes Will-Call &amp; Direct
              </SectionTitle>
              <TableToolbar
                rows={data.forecast.days}
                columns={forecastColumns}
                filename={`forecast-${days}d-${branch || 'all'}`}
              />
            </div>

            {data.forecast.days.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-10 flex flex-col items-center gap-2 text-slate-500 text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                No expected deliveries in the next {days} days.
              </div>
            ) : (
              <>
                {forecastStacked.length > 0 && forecastSeries.length > 0 && (
                  <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 mb-3 print:break-inside-avoid">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-sm font-semibold text-white">
                        Forecast by Day · Stacked by Branch
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        next {days} days
                      </span>
                    </div>
                    <TimeSeriesChart
                      data={forecastStacked}
                      series={forecastSeries}
                      stacked
                      height={260}
                    />
                  </div>
                )}

                <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/60">
                      <tr className="border-b border-slate-700">
                        <th
                          className="px-4 py-2.5 text-left text-xs font-medium text-slate-400 sticky left-0 bg-slate-900/80 z-10"
                          rowSpan={2}
                        >
                          Date
                        </th>
                        <th
                          colSpan={branchesShown.length}
                          className="px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-300 border-b border-slate-700/60"
                        >
                          By Branch
                        </th>
                        <th
                          colSpan={data.ship_vias.length}
                          className="px-4 py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-purple-300 border-b border-slate-700/60 border-l border-slate-700/60"
                        >
                          By Ship Via
                        </th>
                        <th
                          rowSpan={2}
                          className="px-4 py-2.5 text-right text-xs font-semibold text-cyan-300 pr-4 border-l border-slate-700/60"
                        >
                          Total
                        </th>
                      </tr>
                      <tr className="border-b border-slate-700">
                        {branchesShown.map((b) => (
                          <th
                            key={b}
                            className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-500"
                          >
                            {BRANCH_LABELS[b] ?? b}
                          </th>
                        ))}
                        {data.ship_vias.map((sv, i) => (
                          <th
                            key={sv}
                            className={`px-3 py-1.5 text-right text-[11px] font-medium text-slate-500 ${
                              i === 0 ? 'border-l border-slate-700/60' : ''
                            }`}
                          >
                            {sv}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.forecast.days.map((d) => {
                        const wknd = isWeekend(d.date);
                        return (
                          <tr
                            key={d.date}
                            className={`border-b border-slate-800 hover:bg-slate-800/40 transition ${
                              wknd ? 'bg-slate-900/30' : ''
                            }`}
                          >
                            <td
                              className={`px-4 py-2.5 sticky left-0 z-10 ${
                                wknd ? 'bg-slate-900/60' : 'bg-slate-800/60'
                              }`}
                            >
                              <span className="text-white font-medium">{fmtDate(d.date)}</span>
                              {wknd && (
                                <span className="ml-2 text-[10px] uppercase text-slate-500">
                                  Wknd
                                </span>
                              )}
                            </td>
                            {branchesShown.map((b) => (
                              <td
                                key={b}
                                className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-300"
                              >
                                {d.by_branch[b]
                                  ? d.by_branch[b]!.toLocaleString()
                                  : <span className="text-slate-700">·</span>}
                              </td>
                            ))}
                            {data.ship_vias.map((sv, i) => (
                              <td
                                key={sv}
                                className={`px-3 py-2.5 text-right font-mono tabular-nums text-purple-300 ${
                                  i === 0 ? 'border-l border-slate-700/60' : ''
                                }`}
                              >
                                {d.by_ship_via[sv]
                                  ? d.by_ship_via[sv].toLocaleString()
                                  : <span className="text-slate-700">·</span>}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-cyan-300 pr-4 border-l border-slate-700/60">
                              {d.total.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-900/60 font-semibold">
                        <td className="px-4 py-2.5 sticky left-0 bg-slate-900/80 z-10 text-slate-300 uppercase text-xs tracking-wide">
                          Total
                        </td>
                        {branchesShown.map((b) => (
                          <td
                            key={b}
                            className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-300"
                          >
                            {(data.forecast.branch_totals[b] ?? 0).toLocaleString()}
                          </td>
                        ))}
                        {data.ship_vias.map((sv, i) => (
                          <td
                            key={sv}
                            className={`px-3 py-2.5 text-right font-mono tabular-nums text-purple-300 ${
                              i === 0 ? 'border-l border-slate-700/60' : ''
                            }`}
                          >
                            {(data.forecast.ship_via_totals[sv] ?? 0).toLocaleString()}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-cyan-300 pr-4 border-l border-slate-700/60">
                          {data.forecast.grand_total.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            )}
          </section>

          {/* ── Footer note ───────────────────────────────────────────────── */}
          <p className="text-xs text-slate-500 flex items-start gap-2">
            <Truck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-600" />
            Open orders include will-calls and direct ships alongside standard deliveries.
            HOLD and install-only orders are excluded since their counts churn as orders move
            on/off hold and aren't actionable. The forecast also excludes will-calls and direct
            ships since neither produces a yard/dispatch shipment.
          </p>
        </>
      )}
    </div>
  );
}
