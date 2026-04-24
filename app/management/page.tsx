import Link from 'next/link';
import { BarChart3, Building2, Users, Package, List, FileBarChart2, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchBranchSummaries,
  fetchAggregateSaleTypes,
} from '../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../src/lib/scorecard/types';
import ExportTableButton from '../../src/components/shared/ExportTableButton';

export const metadata = { title: 'Management — Beisser LiveEdge' };

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const BRANCH_LIST = Object.keys(BRANCH_LABELS);

function fmt$(n: number | null): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number | null, gp: number | null): string {
  if (!sales || !gp) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
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

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
        {action}
      </div>
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

  const [kpis, threeYear, branchSummaries, saleTypes] = await Promise.all([
    fetchAggregateKpis(params, 'All Branches'),
    fetchAggregateThreeYear(params),
    fetchBranchSummaries(baseYear, compareYear, cutoffDate, period),
    fetchAggregateSaleTypes(params),
  ]);

  const periodLabel = period === 'YTD' ? `YTD through ${cutoffDate}` : 'Full Year';

  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;
  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;

  // Build period/year query string for sub-page links
  const qs = `baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`;

  // Export data for tables
  const branchExportData = branchSummaries.map((b) => ({
    Branch: BRANCH_LABELS[b.branchId] ?? b.branchId,
    [`${baseYear} Sales`]: b.salesBase,
    [`${compareYear} Sales`]: b.salesCompare,
    [`${baseYear} GP`]: b.gpBase,
    'GM%': b.salesBase ? `${((b.gpBase / b.salesBase) * 100).toFixed(1)}%` : '—',
    Customers: b.customerCount,
  }));

  const threeYearExportData = threeYear.map((e) => ({
    Year: e.year,
    Label: e.label,
    Sales: e.sales,
    'Gross Profit': e.gp,
    'GM%': e.sales ? `${((e.gp / e.sales) * 100).toFixed(1)}%` : '—',
  }));

  const saleTypeExportData = saleTypes
    .filter((s) => !s.isExcluded)
    .map((s) => ({
      'Sale Type': s.category,
      [`${baseYear} Sales`]: s.salesBase,
      [`${baseYear} GP`]: s.gpBase,
      [`${compareYear} Sales`]: s.salesCompare,
    }));

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

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Net Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
        <KpiCard label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
        <KpiCard label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
        <KpiCard label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
        <KpiCard label="Orders" base={kpis.base.soCount} compare={kpis.compare.soCount} format="number" />
      </div>

      {/* 3-Year Comparison */}
      <Section
        title="3-Year Comparison"
        action={<ExportTableButton data={threeYearExportData} filename="3year-comparison" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-left text-slate-400 font-medium">Year</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">Gross Profit</th>
                <th className="pb-2 text-right text-slate-300 font-semibold">GM%</th>
              </tr>
            </thead>
            <tbody>
              {threeYear.map((e) => (
                <tr key={e.year} className="border-b border-slate-800">
                  <td className="py-2.5 font-medium text-white">{e.label}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-emerald-400">{fmt$(e.sales)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmt$(e.gp)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">{fmtPct(e.sales, e.gp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Branch Summary */}
      <Section
        title="By Branch"
        action={
          <div className="flex items-center gap-2">
            <ExportTableButton data={branchExportData} filename="branch-summary" />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-left text-slate-400 font-medium">Branch</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{compareYear} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear} GP</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">GM%</th>
                <th className="pb-2 text-right text-slate-300 font-semibold">Customers</th>
              </tr>
            </thead>
            <tbody>
              {branchSummaries.map((b) => {
                const branchUrl = `/scorecard/branch/${b.branchId}?${qs}`;
                return (
                  <tr key={b.branchId} className="border-b border-slate-800 hover:bg-slate-800/40 transition group">
                    <td className="py-2.5 pr-4">
                      <Link href={branchUrl} className="font-medium text-white group-hover:text-cyan-400 transition flex items-center gap-1">
                        {BRANCH_LABELS[b.branchId] ?? b.branchId}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 ml-auto" />
                      </Link>
                    </td>
                    <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${b.salesBase >= b.salesCompare ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt$(b.salesBase)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(b.salesCompare)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmt$(b.gpBase)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmtPct(b.salesBase, b.gpBase)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-400">{b.customerCount.toLocaleString()}</td>
                  </tr>
                );
              })}
              {BRANCH_LIST.map((id) => {
                if (branchSummaries.find((b) => b.branchId === id)) return null;
                return (
                  <tr key={id} className="border-b border-slate-800">
                    <td className="py-2.5 pr-4 text-slate-500">{BRANCH_LABELS[id]}</td>
                    <td colSpan={5} className="py-2.5 text-center text-slate-600 text-xs">No data</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Sales by Type */}
      <Section
        title="Sales by Type"
        action={<ExportTableButton data={saleTypeExportData} filename="sales-by-type" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-left text-slate-400 font-medium">Sale Type</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear} GP</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">GM%</th>
                <th className="pb-2 text-right text-slate-300 font-semibold">{compareYear} Sales</th>
              </tr>
            </thead>
            <tbody>
              {saleTypes.filter((s) => !s.isExcluded).map((s) => (
                <tr key={s.category} className="border-b border-slate-800">
                  <td className="py-2.5 font-medium text-white">{s.category}</td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${s.salesBase >= s.salesCompare ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt$(s.salesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmt$(s.gpBase)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmtPct(s.salesBase, s.gpBase)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-400">{fmt$(s.salesCompare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
