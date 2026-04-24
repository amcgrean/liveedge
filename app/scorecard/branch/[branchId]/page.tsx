import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchAggregateProductMajors,
  fetchAggregateSaleTypes,
  fetchCustomerList,
} from '../../../../src/lib/scorecard/queries';
import type { AggregateParams, ScorecardParams } from '../../../../src/lib/scorecard/types';
import ExportTableButton from '../../../../src/components/shared/ExportTableButton';
import KpiTile from '../../[customerId]/components/KpiTile';
import ComparisonTable from '../../[customerId]/components/ComparisonTable';
import ProductMajorTable from '../../[customerId]/components/ProductMajorTable';
import SaleTypeTable from '../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../_components/AggregateFilterBar';
import ScorecardTabs from '../../_components/ScorecardTabs';
import { ChevronRight } from 'lucide-react';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const VALID_BRANCHES = Object.keys(BRANCH_LABELS);

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

const NO_DTP = { base: null, compare: null };

export default async function BranchScorecardPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { branchId } = await routeParams;
  if (!VALID_BRANCHES.includes(branchId)) notFound();

  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = (String(sp.period ?? 'YTD')) as AggregateParams['period'];
  const cutoffDate = String(sp.cutoffDate ?? today);

  const params: AggregateParams = {
    branchIds: [branchId],
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  const fakeCustomerParams: ScorecardParams = {
    customerId: '',
    branchIds: [branchId],
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  const [kpis, threeYear, productMajors, saleTypes, topCustomers] = await Promise.all([
    fetchAggregateKpis(params, BRANCH_LABELS[branchId] ?? branchId),
    fetchAggregateThreeYear(params),
    fetchAggregateProductMajors(params),
    fetchAggregateSaleTypes(params),
    fetchCustomerList(baseYear, compareYear, [branchId], '', 15),
  ]);

  const topCustomerExportData = topCustomers.map((c) => ({
    Customer: c.customerName,
    'Customer ID': c.customerId,
    [`${baseYear} Sales`]: c.salesBase,
    [`${compareYear} Sales`]: c.salesCompare,
    [`${baseYear} GP`]: c.gpBase,
    'GM%': c.salesBase ? `${((c.gpBase / c.salesBase) * 100).toFixed(1)}%` : '—',
  }));

  const threeYearExportData = threeYear.map((e) => ({
    Year: e.year,
    Label: e.label,
    Sales: e.sales,
    'Gross Profit': e.gp,
    'GM%': e.sales ? `${((e.gp / e.sales) * 100).toFixed(1)}%` : '—',
  }));

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';

  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;
  const nsPctBase = kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null;
  const nsPctCompare = kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null;
  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;

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

      <div className="print:hidden">
        <Link href="/scorecard/overview" className="text-sm text-cyan-400 hover:underline">
          ← Company Overview
        </Link>
      </div>

      {/* Branch selector chips */}
      <div className="flex gap-2 flex-wrap print:hidden">
        {VALID_BRANCHES.map((b) => (
          <Link
            key={b}
            href={`/scorecard/branch/${b}?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              b === branchId ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {BRANCH_LABELS[b]}
          </Link>
        ))}
      </div>

      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-white">
          {BRANCH_LABELS[branchId] ?? branchId}
          <span className="text-slate-400 font-normal text-base ml-2">Branch Scorecard</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{baseYear} vs {compareYear}</span>
          <span className="text-slate-600">·</span>
          <span>{periodLabel}</span>
        </div>
      </div>

      <AggregateFilterBar
        basePath={`/scorecard/branch/${branchId}`}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={[branchId]}
        showBranchFilter={false}
      />

      <Section title="3-Year Comparison">
        <div className="flex justify-end mb-2 print:hidden">
          <ExportTableButton data={threeYearExportData} filename={`${BRANCH_LABELS[branchId] ?? branchId}-3year`} />
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

      {/* Top customers for this branch */}
      <Section title="Top Customers">
        <div className="flex justify-end mb-2 print:hidden">
          <ExportTableButton data={topCustomerExportData} filename={`${BRANCH_LABELS[branchId] ?? branchId}-top-customers`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="pb-2 text-left text-slate-400 font-medium">Customer</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{baseYear} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold pr-4">{compareYear} Sales</th>
                <th className="pb-2 text-right text-slate-300 font-semibold">GM%</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c) => {
                const custUrl = `/scorecard/${encodeURIComponent(c.customerId)}?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}&branch=${branchId}`;
                return (
                  <tr key={c.customerId} className="border-b border-slate-800 hover:bg-slate-800/40 transition group">
                    <td className="py-2 pr-4">
                      <Link href={custUrl} className="flex items-center gap-1 group-hover:text-cyan-400 transition">
                        <span className="font-medium text-white">{c.customerName}</span>
                        <span className="text-slate-500 text-xs ml-1">{c.customerId}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 ml-auto" />
                      </Link>
                    </td>
                    <td className={`py-2 pr-4 text-right font-mono tabular-nums ${deltaClass(c.salesBase, c.salesCompare)}`}>
                      {fmt$(c.salesBase)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(c.salesCompare)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-300">{fmtPct(c.salesBase, c.gpBase)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pt-1 text-right">
          <Link
            href={`/scorecard?baseYear=${baseYear}&compareYear=${compareYear}&branch=${branchId}`}
            className="text-xs text-cyan-400 hover:underline"
          >
            View all customers →
          </Link>
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
