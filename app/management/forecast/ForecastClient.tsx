'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, RefreshCw, ChevronLeft, Truck, Layers, AlertTriangle, BarChart3,
  DollarSign, Package, Clock, HelpCircle,
} from 'lucide-react';
import type {
  ForecastPayload, Branch, OpenOrderRow, ForecastDayRow,
  HorizonKey, HorizonBucket,
} from '../../../src/lib/forecast/types';
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

// ── Temporary kill-switch for dollar KPIs ────────────────────────────────────
// The previous `qty_ordered * price` math overstated open-order $ by 10–100×
// because `price` is denominated in a UOM identified by `price_uom_ptr` with
// no conversion factor available in Supabase. Sync-worker PR #32 (beisser-api
// repo) added a UOM-aware `extended_price` column on `agility_so_lines` plus
// a rebuilt `v_open_order_value` view. Backfill is mid-flight as of 2026-05-14.
// Re-enable this flag once `extended_price IS NOT NULL` on ≥99% of open SO
// lines (verify with the SQL in the PR-32 handoff) and swap the API route to
// `SUM(extended_price)` / `SUM(unshipped_extended_price)`.
const SHOW_DOLLARS = false;

// Horizon display order + labels. Overdue and far-future/unscheduled get
// stronger visual weight since they're the actionable buckets.
const HORIZONS: Array<{
  key: HorizonKey;
  label: string;
  sub: string;
  tone: 'danger' | 'warn' | 'normal' | 'muted';
}> = [
  { key: 'overdue',      label: 'Overdue',           sub: 'past expected date',      tone: 'danger' },
  { key: 'next_7',       label: 'Next 7 Days',       sub: 'this week',               tone: 'normal' },
  { key: 'next_8_30',    label: 'Next 8–30',         sub: '~1 month out',            tone: 'normal' },
  { key: 'next_31_90',   label: 'Next 31–90',        sub: '1–3 months out',          tone: 'normal' },
  { key: 'next_91_plus', label: '91 d – 2 yr',       sub: 'real future orders',      tone: 'muted'  },
  { key: 'far_future',   label: 'Far Future',        sub: '> 2 yr placeholder',      tone: 'warn'   },
  { key: 'unscheduled',  label: 'Unscheduled',       sub: 'no date set',             tone: 'warn'   },
];

const TONE_CLASSES: Record<'danger' | 'warn' | 'normal' | 'muted', string> = {
  danger: 'border-red-700/60 bg-red-950/30',
  warn:   'border-amber-700/60 bg-amber-950/20',
  normal: 'border-slate-700 bg-slate-800/40',
  muted:  'border-slate-800 bg-slate-900/30',
};

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

function fmtMoney(n: number, compact = false): string {
  if (!SHOW_DOLLARS) return '—';
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (compact && Math.abs(n) >= 1000) {
    return '$' + new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  }
  return '$' + Math.round(n).toLocaleString();
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

  const openOrdersPareto = useMemo(() => {
    if (!data) return [];
    return data.open_orders.rows
      .map((row) => ({ label: row.sale_type, value: row.total }))
      .filter((r) => r.value > 0);
  }, [data]);

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

  const openOrdersColumns: ColumnDef<OpenOrderRow>[] = useMemo(() => [
    { key: 'sale_type', header: 'Sale Type', accessor: (r) => r.sale_type },
    ...branchesShown.map<ColumnDef<OpenOrderRow>>((b) => ({
      key: `branch_${b}`,
      header: BRANCH_LABELS[b] ?? b,
      accessor: (r) => r.by_branch[b] ?? 0,
      align: 'right',
    })),
    { key: 'total',           header: 'Orders',         accessor: (r) => r.total,           align: 'right' },
    { key: 'ordered_value',   header: 'Ordered $',      accessor: (r) => r.ordered_value,   align: 'right' },
    { key: 'unshipped_value', header: 'Unshipped $',    accessor: (r) => r.unshipped_value, align: 'right' },
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
      { key: 'total',           header: 'Orders',      accessor: (d) => d.total,           align: 'right' },
      { key: 'unshipped_value', header: 'Unshipped $', accessor: (d) => d.unshipped_value, align: 'right' },
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
            {branchLabel} · Daily forecast next {days} days · Horizon buckets cover all open orders
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

      {!SHOW_DOLLARS && (
        <div className="p-3 bg-amber-950/30 border border-amber-700/60 rounded-lg text-amber-200 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          <div>
            <strong className="font-semibold">Dollar values temporarily hidden.</strong>{' '}
            The forecast previously summed <code className="font-mono text-amber-300">qty_ordered × price</code> without
            applying UOM conversion, which overstated open-order $ by 10–100× on lumber lines.
            A UOM-aware <code className="font-mono text-amber-300">extended_price</code> column is being backfilled
            upstream (beisser-api PR #32). Counts remain accurate; $ tiles will return once the
            backfill is verified.
          </div>
        </div>
      )}

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
          {/* ── KPI Strip ─────────────────────────────────────────────────── */}
          <section>
            <SectionTitle>Open Order KPIs</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiTile
                icon={<Package className="w-5 h-5 text-cyan-400" />}
                label="Open Orders"
                value={data.kpis.open_order_count.toLocaleString()}
                hint="all open statuses · excl. HOLD/XINSTALL"
              />
              <KpiTile
                icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
                label="Open Ordered $"
                value={fmtMoney(data.kpis.ordered_value, true)}
                hint="all open SOs · sold value"
                emphasize
              />
              <KpiTile
                icon={<Truck className="w-5 h-5 text-emerald-400" />}
                label="Unshipped $"
                value={fmtMoney(data.kpis.unshipped_value, true)}
                hint="qty_ordered − qty_shipped × price"
                emphasize
              />
              <KpiTile
                icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
                label="No-Date / Far-Future Orders"
                value={data.kpis.unscheduled_or_far_future_count.toLocaleString()}
                hint="parked on placeholder dates · clean up"
                warn={data.kpis.unscheduled_or_far_future_count > 0}
              />
            </div>

            {data.kpis.by_branch.length > 0 && (
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
                {data.kpis.by_branch.map((b) => (
                  <div
                    key={b.branch}
                    className="bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        {BRANCH_LABELS[b.branch] ?? b.branch}
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {b.count.toLocaleString()} <span className="text-xs text-slate-500 font-normal">orders</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">Unshipped</div>
                      <div className="text-sm font-mono tabular-nums text-emerald-300">
                        {fmtMoney(b.unshipped_value, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Horizon Buckets ───────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Open Orders by Time Horizon</SectionTitle>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                $ = SUM(qty_ordered × price) on all open SO lines
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
              {HORIZONS.map((h) => {
                const b: HorizonBucket = data.horizons[h.key];
                return (
                  <div
                    key={h.key}
                    className={`rounded-lg border ${TONE_CLASSES[h.tone]} p-3 print:break-inside-avoid`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <Clock className={`w-3 h-3 ${
                        h.tone === 'danger' ? 'text-red-400'
                        : h.tone === 'warn' ? 'text-amber-400'
                        : 'text-slate-500'
                      }`} />
                      <span className={`text-[10px] uppercase tracking-wide font-bold ${
                        h.tone === 'danger' ? 'text-red-300'
                        : h.tone === 'warn' ? 'text-amber-300'
                        : 'text-slate-400'
                      }`}>
                        {h.label}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-white font-mono tabular-nums">
                      {b.count.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mb-2">{h.sub}</div>
                    <div className="text-xs font-mono tabular-nums text-emerald-300">
                      {fmtMoney(b.unshipped_value, true)}
                    </div>
                    <div className="text-[10px] text-slate-500">unshipped $</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Far-Future / Unscheduled Drill ─────────────────────────────── */}
          {data.far_future_orders.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>
                  Data Hygiene · Orders With No Real Ship Date (Top 20 by Ordered $)
                </SectionTitle>
                <span className="text-[10px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  These don't show in the daily forecast
                </span>
              </div>
              <div className="bg-amber-950/10 border border-amber-700/40 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900/60">
                      <tr className="border-b border-slate-700">
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">SO #</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Customer</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Rep</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Branch</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Sale Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Expect Date</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Ordered $</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Unshipped $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.far_future_orders.map((o) => (
                        <tr key={`${o.system_id}-${o.so_id}`} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition">
                          <td className="px-3 py-2">
                            <Link href={`/sales/orders/${o.so_id}`} className="text-cyan-400 hover:text-cyan-300 font-mono">
                              {o.so_id}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-slate-300">
                            {o.cust_name ?? <span className="text-slate-600">—</span>}
                            {o.cust_code && <span className="text-slate-500 text-xs ml-1">({o.cust_code})</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-400">{o.rep_1 ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-400">{BRANCH_LABELS[o.system_id] ?? o.system_id}</td>
                          <td className="px-3 py-2 text-slate-400">{o.sale_type ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300">
                              {o.so_status || 'B'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {o.bucket === 'unscheduled' ? (
                              <span className="text-amber-400 italic">no date</span>
                            ) : (
                              <span className="text-amber-300 font-mono">{o.expect_date}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-300">
                            {fmtMoney(o.ordered_value)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-300">
                            {fmtMoney(o.unshipped_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

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
                    open orders sorted by volume
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
                          label="Orders"
                          sort={openSort}
                          onToggle={toggleOpen}
                          align="right"
                          className="px-4 py-2.5 text-right text-xs font-semibold text-cyan-300"
                        />
                        <SortableHeader
                          columnKey="ordered_value"
                          label="Ordered $"
                          sort={openSort}
                          onToggle={toggleOpen}
                          align="right"
                          className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-300"
                        />
                        <SortableHeader
                          columnKey="unshipped_value"
                          label="Unshipped $"
                          sort={openSort}
                          onToggle={toggleOpen}
                          align="right"
                          className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-300 pr-4"
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
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-cyan-300">
                            {row.total.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300">
                            {fmtMoney(row.ordered_value, true)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300 pr-4">
                            {fmtMoney(row.unshipped_value, true)}
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
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-cyan-300">
                          {data.open_orders.grand_total.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300">
                          {fmtMoney(data.open_orders.grand_ordered_value, true)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300 pr-4">
                          {fmtMoney(data.open_orders.grand_unshipped_value, true)}
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
                        next {days} days · {fmtMoney(data.forecast.grand_unshipped_value, true)} unshipped $
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
                          className="px-4 py-2.5 text-right text-xs font-semibold text-cyan-300 border-l border-slate-700/60"
                        >
                          Orders
                        </th>
                        <th
                          rowSpan={2}
                          className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-300 pr-4"
                        >
                          Unshipped $
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
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-cyan-300 border-l border-slate-700/60">
                              {d.total.toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300 pr-4">
                              {d.unshipped_value ? fmtMoney(d.unshipped_value, true) : <span className="text-slate-700">·</span>}
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
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-cyan-300 border-l border-slate-700/60">
                          {data.forecast.grand_total.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-300 pr-4">
                          {fmtMoney(data.forecast.grand_unshipped_value, true)}
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
            <span>
              Open-order <strong className="text-slate-400">counts and dollars</strong> include
              all open statuses (will-call, direct, ready-to-ship, partial/short) and exclude
              HOLD/XINSTALL. Dollar values are computed inline from agility_so_lines as
              SUM(qty_ordered × price) for ordered and SUM((qty_ordered − qty_shipped) × price)
              for unshipped. The daily delivery forecast still excludes will-call and direct
              ships since those don't produce a yard/dispatch shipment. Far-future/unscheduled
              orders cover anything past two years out or with a NULL expect-date — these don't
              appear in the daily forecast chart and represent data-hygiene opportunities for
              sales reps.
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function KpiTile({
  icon, label, value, hint, emphasize, warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${
      warn ? 'border-amber-700/60 bg-amber-950/20'
      : emphasize ? 'border-emerald-700/40 bg-emerald-950/10'
      : 'border-slate-700 bg-slate-800/40'
    } print:break-inside-avoid`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{label}</span>
      </div>
      <div className={`font-mono tabular-nums ${emphasize ? 'text-3xl' : 'text-2xl'} font-bold ${
        warn ? 'text-amber-200' : 'text-white'
      }`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
