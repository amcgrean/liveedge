import Link from 'next/link';
import { BarChart3, Building2, Users, Package, List, FileBarChart2, ChevronRight, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchBranchSummaries,
  fetchAggregateSaleTypes,
} from '../../src/lib/scorecard/queries';
import type { AggregateParams, KpiComparison } from '../../src/lib/scorecard/types';
import ManagementCharts from './_components/ManagementCharts';
import { ThreeYearTable, BranchSummaryTable, SalesByTypeTable } from './_components/ManagementTables';

export const metadata = { title: 'Management — Beisser LiveEdge' };

function fmt$(n: number | null): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function delta(base: number | null, compare: number | null): number | null {
  if (!base || !compare) return null;
  return ((base - compare) / compare) * 100;
}

function DeltaChip({ base, compare }: { base: number | null; compare: number | null }) {
  const pct = delta(base, compare);
  if (pct === null) return <span className="text-slate-600 text-xs">—</span>;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.1;
  if (flat) return <Minus className="w-3 h-3 text-slate-500 inline" />;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, base, compare, format }: {
  label: string;
  base: number | null;
  compare: number | null;
  format: 'currency' | 'percent' | 'number';
}) {
  const fmtVal = (v: number | null) => {
    if (v === null) return '—';
    if (format === 'currency') return fmt$(v);
    if (format === 'percent') return `${(v * 100).toFixed(1)}%`;
    return v.toLocaleString();
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-xl font-bold text-white tabular-nums truncate">{fmtVal(base)}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-slate-500 tabular-nums truncate">{fmtVal(compare)} prior yr</span>
        <DeltaChip base={base} compare={compare} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

const REPORT_TILES = [
  {
    href: '/scorecard/overview',
    icon: BarChart3,
    label: 'Company Overview',
    desc: 'Full P&L, product mix, and sale type breakdown',
    color: 'text-cyan-400',
    bg: 'bg-cyan-900/20 border-cyan-800/40 hover:border-cyan-600/60',
  },
  {
    href: '/scorecard/branch/20GR',
    icon: Building2,
    label: 'By Branch',
    desc: 'Individual branch scorecards with top customers',
    color: 'text-blue-400',
    bg: 'bg-blue-900/20 border-blue-800/40 hover:border-blue-600/60',
  },
  {
    href: '/scorecard/rep',
    icon: Users,
    label: 'By Sales Rep',
    desc: 'Rep performance — assigned book and written-up orders',
    color: 'text-violet-400',
    bg: 'bg-violet-900/20 border-violet-800/40 hover:border-violet-600/60',
  },
  {
    href: '/scorecard/product',
    icon: Package,
    label: 'Product Groups',
    desc: 'Product mix, quantities, and margin by category',
    color: 'text-amber-400',
    bg: 'bg-amber-900/20 border-amber-800/40 hover:border-amber-600/60',
  },
  {
    href: '/scorecard',
    icon: List,
    label: 'Customer Scorecard',
    desc: 'Individual customer scorecards across all branches',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/20 border-emerald-800/40 hover:border-emerald-600/60',
  },
  {
    href: '/sales/reports',
    icon: FileBarChart2,
    label: 'Sales Reports',
    desc: 'Order volume, daily activity, and status analytics',
    color: 'text-rose-400',
    bg: 'bg-rose-900/20 border-rose-800/40 hover:border-rose-600/60',
  },
  {
    href: '/management/forecast',
    icon: Calendar,
    label: 'Open Orders & Forecast',
    desc: 'Open orders by sale type and branch · delivery forecast by day, ship via, and branch',
    color: 'text-sky-400',
    bg: 'bg-sky-900/20 border-sky-800/40 hover:border-sky-600/60',
  },
];

export default async function ManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = (String(sp.period ?? 'YTD')) as AggregateParams['period'];
  const cutoffDate = String(sp.cutoffDate ?? today);

  const params: AggregateParams = {
    branchIds: [],
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  // Use allSettled so a single failing query doesn't crash the entire page render.
  const [kpisRes, threeYearRes, branchSummariesRes, saleTypesRes] = await Promise.allSettled([
    fetchAggregateKpis(params, 'All Branches'),
    fetchAggregateThreeYear(params),
    fetchBranchSummaries(baseYear, compareYear, cutoffDate, period),
    fetchAggregateSaleTypes(params),
  ]);

  const failures: string[] = [];
  const logFail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      failures.push(name);
      console.error(`[management/page] ${name} failed:`, r.reason);
    }
  };
  logFail('aggregate kpis', kpisRes);
  logFail('three-year comparison', threeYearRes);
  logFail('branch summaries', branchSummariesRes);
  logFail('aggregate sale types', saleTypesRes);

  const emptyKpis: KpiComparison = {
    base: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    compare: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    branchIds: [],
    shipToCount: 0,
    customerName: 'All Branches',
  };

  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : emptyKpis;
  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const branchSummaries = branchSummariesRes.status === 'fulfilled' ? branchSummariesRes.value : [];
  const saleTypes = saleTypesRes.status === 'fulfilled' ? saleTypesRes.value : [];

  const periodLabel = period === 'YTD' ? `YTD through ${cutoffDate}` : 'Full Year';

  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;
  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;

  // Build period/year query string for sub-page links
  const qs = `baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-cyan-400" />
            Management
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            All Branches · {baseYear} vs {compareYear} · {periodLabel}
          </p>
        </div>

        {/* Period / year controls */}
        <form method="GET" className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
            {(['YTD', 'Full Year'] as const).map((p) => (
              <a
                key={p}
                href={`/management?baseYear=${baseYear}&compareYear=${compareYear}&period=${p}&cutoffDate=${cutoffDate}`}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  period === p ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p}
              </a>
            ))}
          </div>
          <select
            name="baseYear"
            defaultValue={baseYear}
            form="year-form"
            className="hidden"
          />
          <div className="flex items-center gap-1.5">
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <a
                key={y}
                href={`/management?baseYear=${y}&compareYear=${y - 1}&period=${period}&cutoffDate=${y === currentYear ? today : `${y}-12-31`}`}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                  baseYear === y
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {y}
              </a>
            ))}
          </div>
        </form>
      </div>

      {failures.length > 0 && (
        <div className="p-3 bg-amber-900/30 border border-amber-700/60 rounded-lg text-amber-200 text-sm">
          Some sections failed to load: {failures.join(', ')}. Showing available data.
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Net Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
        <KpiCard label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
        <KpiCard label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
        <KpiCard label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
        <KpiCard label="Orders" base={kpis.base.soCount} compare={kpis.compare.soCount} format="number" />
      </div>

      {/* Charts */}
      <ManagementCharts
        threeYear={threeYear}
        branchSummaries={branchSummaries}
        saleTypes={saleTypes}
        baseYear={baseYear}
        compareYear={compareYear}
      />

      {/* 3-Year Comparison */}
      <Section title="3-Year Comparison">
        <ThreeYearTable rows={threeYear} />
      </Section>

      {/* Branch Summary */}
      <Section title="By Branch">
        <BranchSummaryTable rows={branchSummaries} baseYear={baseYear} compareYear={compareYear} qs={qs} />
      </Section>

      {/* Sales by Type */}
      <Section title="Sales by Type">
        <SalesByTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
      </Section>

      {/* Report tiles */}
      <div>
        <h2 className="text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-3">
          Reports &amp; Scorecards
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {REPORT_TILES.map((tile) => {
            const Icon = tile.icon;
            const tileHref = tile.href.startsWith('/scorecard')
              ? `${tile.href}?${qs}`
              : tile.href;
            return (
              <Link
                key={tile.href}
                href={tileHref}
                className={`flex flex-col gap-2 rounded-xl border p-4 transition group ${tile.bg}`}
              >
                <Icon className={`w-6 h-6 ${tile.color}`} />
                <div>
                  <p className="text-sm font-semibold text-white group-hover:text-white leading-tight">{tile.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{tile.desc}</p>
                </div>
                <ChevronRight className={`w-4 h-4 ${tile.color} mt-auto self-end opacity-60 group-hover:opacity-100 transition`} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
