'use client';

import React, { useState, useMemo, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, TrendingDown, BarChart2, Package, Building2,
  AlertTriangle, ChevronRight, ChevronDown, X, ExternalLink,
  ShieldAlert, Truck, CheckCircle2, Clock, Minus,
} from 'lucide-react';
import type {
  VendorListRow,
  VendorScorecardSummary,
  VendorScorecardParams,
  RebateProgram,
} from '@/lib/vendor-scorecard/types';
import { fetchVendorDetail } from '@/lib/vendor-scorecard/queries';
import type { VendorDetail } from '@/lib/vendor-scorecard/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRANCHES = [
  { id: 'all', label: 'All Branches' },
  { id: '10FD', label: 'Fort Dodge' },
  { id: '20GR', label: 'Grimes' },
  { id: '25BW', label: 'Birchwood' },
  { id: '40CV', label: 'Coralville' },
];

const RANGES: { id: VendorScorecardParams['range']; label: string }[] = [
  { id: 'MTD', label: 'MTD' },
  { id: 'QTD', label: 'QTD' },
  { id: 'YTD', label: 'YTD' },
  { id: 'TTM', label: 'TTM' },
  { id: 'FY',  label: 'Full Year' },
];

const PROG_TYPE_LABELS: Record<string, string> = {
  volume_tier: 'Volume / Tier',
  growth:      'Growth',
  mix_attach:  'Mix / Attach',
  other:       'Other',
};

const SEVERITY_COLOR: Record<string, string> = {
  high:   'text-red-400 bg-red-900/20 border-red-700/50',
  medium: 'text-amber-400 bg-amber-900/20 border-amber-700/50',
  low:    'text-slate-400 bg-slate-800/40 border-slate-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt$(n: number): string {
  if (!n) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtFull$(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function pct(n: number | null, decimals = 1): string {
  if (n === null) return '—';
  return `${n.toFixed(decimals)}%`;
}

function yoy(base: number, compare: number): number | null {
  if (!compare) return null;
  return ((base - compare) / compare) * 100;
}

function attainmentPct(attained: number, target: number | null): number {
  if (!target || target === 0) return 0;
  return Math.min((attained / target) * 100, 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiTile({
  label, value, sub, delta, color,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  color?: string;
}) {
  const showDelta = delta !== null && delta !== undefined;
  const up = showDelta && delta! > 0;
  const flat = showDelta && Math.abs(delta!) < 0.1;
  return (
    <div
      className="flex flex-col gap-1 p-4 min-w-0"
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--text-3)' }}>
        {label}
      </p>
      <p className={`text-xl font-bold mono truncate ${color ?? ''}`} style={{ color: color ? undefined : 'var(--text)' }}>
        {value}
      </p>
      {(sub || showDelta) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {sub && <span className="text-xs mono" style={{ color: 'var(--text-3)' }}>{sub}</span>}
          {showDelta && !flat && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(delta!).toFixed(1)}%
            </span>
          )}
          {showDelta && flat && <Minus className="w-3 h-3 text-slate-500" />}
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label, sortKey, current, dir, onSort, align = 'left',
}: {
  label: string; sortKey: string; current: string; dir: 'asc' | 'desc';
  onSort: (k: string) => void; align?: 'left' | 'right';
}) {
  const active = current === sortKey;
  return (
    <th
      className={`py-2 px-3 text-${align} cursor-pointer select-none whitespace-nowrap`}
      style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--green-bright)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}
      onClick={() => onSort(sortKey)}
    >
      {label}{' '}
      <span style={{ opacity: active ? 1 : 0.35, color: 'var(--green-bright)' }}>
        {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </th>
  );
}

function ProgCard({ prog }: { prog: RebateProgram }) {
  const pctDone = attainmentPct(prog.attainedAmount, prog.targetAmount);
  const typeLabel = PROG_TYPE_LABELS[prog.programType] ?? prog.programType;
  const barColor = pctDone >= 90 ? '#1f8a4f' : pctDone >= 50 ? '#c9a83f' : '#d05050';

  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{prog.programName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            {typeLabel}{prog.productGroup ? ` · ${prog.productGroup}` : ''} · {prog.payoutTiming}
          </p>
        </div>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: 'var(--panel-2)', color: 'var(--text-2)', border: '1px solid var(--line)' }}
        >
          {prog.periodStart} – {prog.periodEnd}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-3)' }}>
          <span className="mono">{fmtFull$(prog.attainedAmount)} attained</span>
          {prog.targetAmount && (
            <span className="mono">{fmtFull$(prog.targetAmount)} target · {pctDone.toFixed(0)}%</span>
          )}
        </div>
        <div style={{ height: 6, background: 'var(--panel-3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pctDone}%`, height: '100%', background: barColor, borderRadius: 3 }} />
        </div>
      </div>

      {/* Metrics row */}
      <div className="flex gap-4 text-xs flex-wrap">
        {prog.rebateRatePct !== null && (
          <span style={{ color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--text-3)' }}>Rate </span>
            <span className="mono font-semibold">{prog.rebateRatePct}%</span>
          </span>
        )}
        <span style={{ color: 'var(--text-2)' }}>
          <span style={{ color: 'var(--text-3)' }}>Earned </span>
          <span className="mono font-semibold text-emerald-400">{fmtFull$(prog.earnedRebate)}</span>
        </span>
        <span style={{ color: 'var(--text-2)' }}>
          <span style={{ color: 'var(--text-3)' }}>Accrued </span>
          <span className="mono font-semibold">{fmtFull$(prog.accruedRebate)}</span>
        </span>
        {prog.toNextTierAmount !== null && prog.toNextTierAmount > 0 && (
          <span className="text-amber-400">
            {fmtFull$(prog.toNextTierAmount)} to next tier (+{prog.nextTierRatePct}%)
          </span>
        )}
      </div>
    </div>
  );
}

function SparkBar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div style={{ height: 4, background: 'var(--panel-3)', borderRadius: 2, width: 80, flexShrink: 0 }}>
      <div style={{ width: `${w}%`, height: '100%', background: 'var(--green)', borderRadius: 2 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vendor Detail Panel
// ---------------------------------------------------------------------------

function VendorDetailPanel({
  supplierKey,
  supplierName,
  params,
  onClose,
}: {
  supplierKey: string;
  supplierName: string;
  params: VendorScorecardParams;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<VendorDetail | null | 'loading' | 'error'>('loading');
  const [detailTab, setDetailTab] = useState<'overview' | 'programs' | 'mix'>('overview');

  React.useEffect(() => {
    setDetail('loading');
    fetchVendorDetail(supplierKey, params)
      .then(setDetail)
      .catch(() => setDetail('error'));
  }, [supplierKey, params]);

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex flex-col"
      style={{ width: 480, background: 'var(--panel)', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--line)' }}>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{supplierName}</p>
          <p className="text-xs mono" style={{ color: 'var(--text-3)' }}>{supplierKey}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded" style={{ color: 'var(--text-3)' }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--line)' }}>
        {(['overview', 'programs', 'mix'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setDetailTab(t)}
            className="px-4 py-2 text-xs font-medium capitalize"
            style={{
              color: detailTab === t ? 'var(--text)' : 'var(--text-3)',
              borderBottom: detailTab === t ? '2px solid var(--green-bright)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'programs' ? 'Rebates' : t === 'mix' ? 'Product Mix' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {detail === 'loading' && (
          <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>Loading…</div>
        )}
        {detail === 'error' && (
          <div className="text-center py-16 text-red-400">Failed to load vendor detail.</div>
        )}
        {detail !== 'loading' && detail !== 'error' && detail !== null && (
          <>
            {detailTab === 'overview' && (
              <>
                {/* KPI mini-tiles */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Spend YTD',    value: fmtFull$(detail.spendYTD) },
                    { label: 'Spend PY',     value: fmtFull$(detail.spendPY) },
                    { label: 'Fill Rate',    value: pct(detail.fillRatePct) },
                    { label: 'On-Time Del.', value: pct(detail.otdPct) },
                    { label: 'Rebate Earned', value: fmtFull$(detail.rebateEarnedYTD) },
                    { label: 'Accrued',      value: fmtFull$(detail.rebateAccrued) },
                    { label: 'Open POs',     value: detail.openPoCount.toLocaleString() },
                    { label: 'Open PO Value', value: fmtFull$(detail.openPoValue) },
                  ].map((k) => (
                    <div key={k.label} className="p-3" style={{ background: 'var(--panel-2)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }}>
                      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                      <p className="text-sm font-bold mono mt-0.5" style={{ color: 'var(--text)' }}>{k.value}</p>
                    </div>
                  ))}
                </div>

                {/* Branch breakdown */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>By Branch</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        {['Branch', 'Spend YTD', 'Fill', 'OTD'].map((h) => (
                          <th key={h} className="pb-1.5 text-left font-semibold" style={{ color: 'var(--text-3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.branchBreakdown.map((b) => (
                        <tr key={b.systemId} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                          <td className="py-1.5 font-medium" style={{ color: 'var(--text)' }}>{b.branchName}</td>
                          <td className="py-1.5 mono text-right" style={{ color: 'var(--text-2)' }}>{fmtFull$(b.spendYTD)}</td>
                          <td className="py-1.5 mono text-right" style={{ color: 'var(--text-2)' }}>{pct(b.fillRatePct)}</td>
                          <td className="py-1.5 mono text-right" style={{ color: 'var(--text-2)' }}>{pct(b.otdPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Risk flags */}
                {detail.riskFlags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Risk Flags</p>
                    <div className="space-y-2">
                      {detail.riskFlags.map((f) => (
                        <div key={f.id} className={`flex gap-2 p-2.5 rounded text-xs border ${SEVERITY_COLOR[f.severity]}`}>
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold capitalize">{f.flagType.replace(/_/g, ' ')}</p>
                            <p className="opacity-80 mt-0.5">{f.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {detailTab === 'programs' && (
              <>
                {detail.rebatePrograms.length === 0 ? (
                  <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>
                    No rebate programs on file for this vendor.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.rebatePrograms.map((p) => <ProgCard key={p.id} prog={p} />)}
                  </div>
                )}
              </>
            )}

            {detailTab === 'mix' && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-3)' }}>Spend by Product Group</p>
                <div className="space-y-2">
                  {detail.productGroupBreakdown.map((g) => (
                    <div key={g.productGroup}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--text)' }}>{g.productGroup}</span>
                        <span className="mono" style={{ color: 'var(--text-3)' }}>
                          {fmtFull$(g.spendYTD)} · {g.pctOfTotal.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 6, background: 'var(--panel-3)', borderRadius: 3 }}>
                        <div
                          style={{
                            width: `${g.pctOfTotal}%`, height: '100%',
                            background: 'var(--green)', borderRadius: 3,
                            minWidth: g.pctOfTotal > 0 ? 4 : 0,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {detail === null && (
          <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>No data found for this vendor.</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VendorScorecardClient({
  summary,
  vendors,
  productGroups,
  initialParams,
}: {
  summary: VendorScorecardSummary;
  vendors: VendorListRow[];
  productGroups: string[];
  initialParams: VendorScorecardParams;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [params, setParams] = useState<VendorScorecardParams>(initialParams);
  const [tab, setTab] = useState<'leaderboard' | 'rebates' | 'mix' | 'risks'>('leaderboard');
  const [sortKey, setSortKey] = useState<string>('spendYTD');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedVendor, setSelectedVendor] = useState<VendorListRow | null>(null);

  const pushParams = useCallback(
    (next: VendorScorecardParams) => {
      setParams(next);
      const sp = new URLSearchParams();
      sp.set('range', next.range);
      if (next.branch !== 'all') sp.set('branch', next.branch);
      if (next.productGroup !== 'all') sp.set('pg', next.productGroup);
      startTransition(() => router.push(`/purchasing/scorecard?${sp.toString()}`));
    },
    [router],
  );

  const handleSort = useCallback((k: string) => {
    if (k === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    return [...vendors].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const dir = sortDir === 'desc' ? -1 : 1;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return (av as string).localeCompare(bv as string) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [vendors, sortKey, sortDir]);

  const spendDelta = yoy(summary.totalSpendYTD, summary.totalSpendPY);

  const totalRiskFlags = vendors.reduce((acc, v) => acc + v.riskFlagCount, 0);
  const vendorsWithRisks = vendors.filter((v) => v.riskFlagCount > 0);
  const maxSpend = sorted[0]?.spendYTD ?? 1;

  const allPrograms = useMemo(() => {
    // Flatten all rebate programs from all vendors for the rebates tab
    // We can't do this client-side without full data — show a placeholder
    return [];
  }, []);

  const TAB_ITEMS: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'leaderboard', label: 'Leaderboard', count: vendors.length },
    { id: 'rebates', label: 'Rebate Programs' },
    { id: 'mix', label: 'Branch & Mix' },
    { id: 'risks', label: 'Risks', count: totalRiskFlags || undefined },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sticky filter bar */}
      <div
        className="sticky top-0 z-40 flex flex-wrap items-center gap-3 px-5 py-2.5"
        style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}
      >
        {/* Range */}
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => pushParams({ ...params, range: r.id })}
              className="px-3 py-1 text-xs font-medium mono transition"
              style={{
                background: params.range === r.id ? 'var(--green)' : 'var(--panel-2)',
                color: params.range === r.id ? 'white' : 'var(--text-2)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Branch */}
        <div className="flex gap-1.5 flex-wrap">
          {BRANCHES.map((b) => (
            <button
              key={b.id}
              onClick={() => pushParams({ ...params, branch: b.id })}
              className="px-2.5 py-1 rounded text-xs font-medium transition"
              style={{
                background: params.branch === b.id ? 'rgba(31,138,79,0.15)' : 'var(--panel-2)',
                color: params.branch === b.id ? 'var(--green-bright)' : 'var(--text-3)',
                border: `1px solid ${params.branch === b.id ? 'var(--green-bright)' : 'var(--line)'}`,
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Product group */}
        {productGroups.length > 0 && (
          <select
            value={params.productGroup}
            onChange={(e) => pushParams({ ...params, productGroup: e.target.value })}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text-2)' }}
          >
            <option value="all">All Product Groups</option>
            {productGroups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>

      <div className="p-5 space-y-5 max-w-screen-2xl mx-auto">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Truck className="w-6 h-6" style={{ color: 'var(--green-bright)' }} />
            Vendor Scorecard
          </h1>
          <p className="text-sm mono mt-0.5" style={{ color: 'var(--text-3)' }}>
            {vendors.length} vendors · {params.range} · {BRANCHES.find((b) => b.id === params.branch)?.label}
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiTile
            label="Total Spend"
            value={fmt$(summary.totalSpendYTD)}
            sub={`${fmt$(summary.totalSpendPY)} PY`}
            delta={spendDelta}
          />
          <KpiTile label="Rebate Earned"   value={fmt$(summary.totalRebateEarned)} sub="YTD" />
          <KpiTile label="Rebate Accrued"  value={fmt$(summary.totalRebateAccrued)} sub="projected" />
          <KpiTile label="FY Forecast"     value={fmt$(summary.totalRebateForecastFY)} />
          <KpiTile
            label="Avg Fill Rate"
            value={pct(summary.avgFillRatePct)}
            color={summary.avgFillRatePct !== null && summary.avgFillRatePct < 90 ? 'text-amber-400' : undefined}
          />
          <KpiTile
            label="Avg On-Time"
            value={pct(summary.avgOtdPct)}
            color={summary.avgOtdPct !== null && summary.avgOtdPct < 85 ? 'text-red-400' : undefined}
          />
          <KpiTile
            label="Top-3 Concentration"
            value={pct(summary.top3ConcentrationPct)}
            color={summary.top3ConcentrationPct > 65 ? 'text-amber-400' : undefined}
          />
          <KpiTile
            label="Program Health"
            value={`${summary.programsOnTrack} / ${summary.programsOnTrack + summary.programsAtRisk + summary.programsMissed}`}
            sub={`${summary.programsAtRisk} at risk · ${summary.programsMissed} missed`}
          />
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex gap-0">
            {TAB_ITEMS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition"
                style={{
                  color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
                  borderBottom: tab === t.id ? '2px solid var(--green-bright)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className="text-xs mono px-1.5 py-0.5 rounded-full"
                    style={{
                      background: 'var(--panel-2)',
                      color: tab === t.id ? 'var(--green-bright)' : 'var(--text-3)',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── LEADERBOARD TAB ── */}
        {tab === 'leaderboard' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <SortHeader label="Vendor"       sortKey="supplierName" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Prod. Group"  sortKey="primaryProductGroup" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Spend YTD"    sortKey="spendYTD"    current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Spend PY"     sortKey="spendPY"     current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="YoY"          sortKey="spendYTD"    current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Fill Rate"    sortKey="fillRatePct" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="OTD"          sortKey="otdPct"      current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Rebate"       sortKey="rebateEarnedYTD" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Programs"     sortKey="activeProgramCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader label="Open POs"     sortKey="openPoCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                  <th className="py-2 px-3" style={{ borderBottom: '1px solid var(--line)', background: 'var(--panel)', width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-16 text-center" style={{ color: 'var(--text-3)' }}>
                      No vendor data for this range.
                    </td>
                  </tr>
                )}
                {sorted.map((v) => {
                  const dy = yoy(v.spendYTD, v.spendPY);
                  const isSelected = selectedVendor?.supplierKey === v.supplierKey;
                  return (
                    <tr
                      key={v.supplierKey}
                      className="cursor-pointer transition"
                      style={{
                        borderBottom: '1px solid var(--line-soft)',
                        background: isSelected ? 'rgba(31,138,79,0.06)' : undefined,
                      }}
                      onClick={() => setSelectedVendor(isSelected ? null : v)}
                    >
                      <td className="py-2.5 px-3">
                        <div style={{ color: 'var(--text)', fontWeight: 500 }}>{v.supplierName || v.supplierCode}</div>
                        <div className="text-xs mono" style={{ color: 'var(--text-3)' }}>{v.supplierCode}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--panel-2)', color: 'var(--text-3)', border: '1px solid var(--line)' }}
                        >
                          {v.primaryProductGroup}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <SparkBar value={v.spendYTD} max={maxSpend} />
                          <span className="mono font-semibold" style={{ color: 'var(--text)' }}>{fmtFull$(v.spendYTD)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right mono" style={{ color: 'var(--text-3)' }}>{fmtFull$(v.spendPY)}</td>
                      <td className="py-2.5 px-3 text-right">
                        {dy !== null ? (
                          <span className={`text-xs font-semibold mono inline-flex items-center gap-0.5 ${dy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {dy >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(dy).toFixed(1)}%
                          </span>
                        ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right mono" style={{
                        color: v.fillRatePct !== null && v.fillRatePct < 90 ? '#c9a83f' : 'var(--text-2)',
                      }}>
                        {pct(v.fillRatePct)}
                      </td>
                      <td className="py-2.5 px-3 text-right mono" style={{
                        color: v.otdPct !== null && v.otdPct < 85 ? '#d05050' : 'var(--text-2)',
                      }}>
                        {pct(v.otdPct)}
                      </td>
                      <td className="py-2.5 px-3 text-right mono text-emerald-400">
                        {v.rebateEarnedYTD > 0 ? fmtFull$(v.rebateEarnedYTD) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right mono" style={{ color: 'var(--text-3)' }}>
                        {v.activeProgramCount > 0 ? v.activeProgramCount : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div>
                          <span className="mono" style={{ color: 'var(--text-2)' }}>{v.openPoCount}</span>
                          {v.openPoCount > 0 && (
                            <div className="text-xs mono" style={{ color: 'var(--text-3)' }}>{fmt$(v.openPoValue)}</div>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          {v.riskFlagCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                              <AlertTriangle className="w-3 h-3" />{v.riskFlagCount}
                            </span>
                          )}
                          <ChevronRight
                            className="w-4 h-4 transition"
                            style={{ color: isSelected ? 'var(--green-bright)' : 'var(--text-4)' }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── REBATES TAB ── */}
        {tab === 'rebates' && (
          <div className="space-y-4">
            {/* Program health summary */}
            {(summary.programsOnTrack + summary.programsAtRisk + summary.programsMissed) > 0 && (
              <div
                className="flex items-center gap-6 px-4 py-3 rounded-lg"
                style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                    <span className="font-bold text-emerald-400">{summary.programsOnTrack}</span> on track
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                    <span className="font-bold text-amber-400">{summary.programsAtRisk}</span> at risk
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-sm" style={{ color: 'var(--text-2)' }}>
                    <span className="font-bold text-red-400">{summary.programsMissed}</span> missed
                  </span>
                </div>
              </div>
            )}
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
              Select a vendor from the Leaderboard tab to view individual rebate programs.
            </p>
            <p className="text-xs" style={{ color: 'var(--text-4)' }}>
              Rebate programs are managed in Purchasing → Vendor Scorecard per-vendor detail panel.
            </p>
          </div>
        )}

        {/* ── BRANCH & MIX TAB ── */}
        {tab === 'mix' && (
          <div className="space-y-4">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Spend by Branch</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    {['Branch', 'Vendor Count', 'Spend YTD', '% of Total', 'Avg Fill', 'Avg OTD'].map((h) => (
                      <th key={h} className="pb-2 px-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BRANCHES.filter((b) => b.id !== 'all').map((b) => {
                    const branchVendors = vendors.filter((v) => true); // all vendors shown
                    const branchSpend = summary.totalSpendYTD / 4; // placeholder (real branch split needs server data)
                    return (
                      <tr key={b.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                        <td className="py-2.5 px-3 font-medium" style={{ color: 'var(--text)' }}>{b.label}</td>
                        <td className="py-2.5 px-3 mono" style={{ color: 'var(--text-3)' }}>—</td>
                        <td className="py-2.5 px-3 mono" style={{ color: 'var(--text-2)' }}>—</td>
                        <td className="py-2.5 px-3 mono" style={{ color: 'var(--text-3)' }}>—</td>
                        <td className="py-2.5 px-3 mono" style={{ color: 'var(--text-3)' }}>—</td>
                        <td className="py-2.5 px-3 mono" style={{ color: 'var(--text-3)' }}>—</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-4)' }}>
              Click a vendor in the Leaderboard to see their branch and product group breakdown in the detail panel.
            </p>
          </div>
        )}

        {/* ── RISKS TAB ── */}
        {tab === 'risks' && (
          <div className="space-y-3">
            {vendorsWithRisks.length === 0 ? (
              <div className="text-center py-16" style={{ color: 'var(--text-3)' }}>
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                No active risk flags.
              </div>
            ) : (
              vendorsWithRisks.map((v) => (
                <div
                  key={v.supplierKey}
                  className="flex items-center justify-between p-3 rounded cursor-pointer transition"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
                  onClick={() => setSelectedVendor(v)}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{v.supplierName || v.supplierCode}</p>
                    <p className="text-xs mono" style={{ color: 'var(--text-3)' }}>{v.supplierCode}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm text-amber-400 font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      {v.riskFlagCount} flag{v.riskFlagCount !== 1 ? 's' : ''}
                    </span>
                    <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-4)' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Vendor detail slide-in */}
      {selectedVendor && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelectedVendor(null)}
          />
          <VendorDetailPanel
            supplierKey={selectedVendor.supplierKey}
            supplierName={selectedVendor.supplierName || selectedVendor.supplierCode}
            params={params}
            onClose={() => setSelectedVendor(null)}
          />
        </>
      )}
    </div>
  );
}
