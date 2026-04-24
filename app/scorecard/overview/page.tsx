import Link from 'next/link';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchAggregateProductMajors,
  fetchAggregateSaleTypes,
  fetchBranchSummaries,
} from '../../../src/lib/scorecard/queries';
import type { AggregateParams, ScorecardParams } from '../../../src/lib/scorecard/types';
import ExportTableButton from '../../../src/components/shared/ExportTableButton';
import KpiTile from '../[customerId]/components/KpiTile';
import ComparisonTable from '../[customerId]/components/ComparisonTable';
import ProductMajorTable from '../[customerId]/components/ProductMajorTable';
import SaleTypeTable from '../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../_components/AggregateFilterBar';
import ScorecardTabs from '../_components/ScorecardTabs';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

function fmt$(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(sales: number, gp: number): string {
  if (sales === 0) return '—';
  return `${((gp / sales) * 100).toFixed(1)}%`;
}

function deltaClass(base: number, compare: number) {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-slate-400';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

// BottomMetrics expects DaysToPayData — company-wide days-to-pay requires customer_payments scan
// For aggregate views we skip it (pass nulls) since it would need an expensive unbounded join
const NO_DTP = { base: null, compare: null };

export default async function OverviewPage({
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
  const branchIds = sp.branch
    ? Array.isArray(sp.branch) ? sp.branch : [sp.branch]
    : [];

  const params: AggregateParams = { branchIds, baseYear, compareYear, period, cutoffDate };

  // Fake ScorecardParams for components that still need it (ProductMajorTable)
  const fakeCustomerParams: ScorecardParams = {
    customerId: '',
    branchIds,
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  const [kpis, threeYear, productMajors, saleTypes, branchSummaries] = await Promise.all([
    fetchAggregateKpis(params, 'All Branches'),
    fetchAggregateThreeYear(params),
    fetchAggregateProductMajors(params),
    fetchAggregateSaleTypes(params),
    fetchBranchSummaries(baseYear, compareYear, cutoffDate, period),
  ]);

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';

  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;
  const nsPctBase = kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null;
  const nsPctCompare = kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null;
  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;

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

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          nav, header { display: none !important; }
        }
      `}</style>

      <ScorecardTabs />

      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-white">Company Overview</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{branchIds.length === 0 ? 'All Branches' : branchIds.map((b) => BRANCH_LABELS[b] ?? b).join(', ')}</span>
          <span className="text-slate-600">·</span>
          <span>{baseYear} vs {compareYear}</span>
          <span className="text-slate-600">·</span>
          <span>{periodLabel}</span>
        </div>
      </div>

      <AggregateFilterBar
        basePath="/scorecard/overview"
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <Section title="3-Year Comparison">
        <div className="flex justify-end mb-2 print:hidden">
          <ExportTableButton data={threeYearExportData} filename="3year-comparison" />
        </div>
        <ComparisonTable entries={threeYear} />
      </Section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile label="Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
        <KpiTile label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
        <KpiTile label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
        <KpiTile label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
        <KpiTile label="Non-Stock %" base={nsPctBase} compare={nsPctCompare} format="percent" higherIsBetter={false} />
      </div>

      {/* Branch breakdown table */}
      <Section title="By Branch">
        <div className="flex justify-end mb-2 print:hidden">
          <ExportTableButton data={branchExportData} filename="branch-overview" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-left text-slate-400 font-medium">Branch</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear}{period === 'YTD' ? ' YTD' : ''} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{compareYear}{period === 'YTD' ? ' YTD' : ''} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear}{period === 'YTD' ? ' YTD' : ''} GP</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">GM%</th>
                <th className="pb-2 text-right text-slate-300 font-semibold">Customers</th>
              </tr>
            </thead>
            <tbody>
              {branchSummaries.map((b) => {
                const branchUrl = `/scorecard/branch/${b.branchId}?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`;
                return (
                  <tr key={b.branchId} className="border-b border-slate-800 hover:bg-slate-800/40 transition group">
                    <td className="py-2.5 pr-4">
                      <Link href={branchUrl} className="font-medium text-white group-hover:text-cyan-400 transition">
                        {BRANCH_LABELS[b.branchId] ?? b.branchId}
                      </Link>
                    </td>
                    <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${deltaClass(b.salesBase, b.salesCompare)}`}>
                      {fmt$(b.salesBase)}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(b.salesCompare)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmt$(b.gpBase)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmtPct(b.salesBase, b.gpBase)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-400">{b.customerCount.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Product Mix">
        <ProductMajorTable
          rows={productMajors}
          params={fakeCustomerParams}
          baseYear={baseYear}
          compareYear={compareYear}
          minorsApiPath="/api/scorecard/aggregate"
        />
      </Section>

      <Section title="Sales by Type">
        <SaleTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
      </Section>

      <Section title="Detail Metrics">
        <BottomMetrics kpis={kpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
      </Section>
    </div>
  );
}
