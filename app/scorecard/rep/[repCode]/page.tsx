import Link from 'next/link';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchAggregateProductMajors,
  fetchAggregateSaleTypes,
  fetchCustomerList,
} from '../../../../src/lib/scorecard/queries';
import type { AggregateParams, ScorecardParams } from '../../../../src/lib/scorecard/types';
import KpiTile from '../../[customerId]/components/KpiTile';
import ComparisonTable from '../../[customerId]/components/ComparisonTable';
import ProductMajorTable from '../../[customerId]/components/ProductMajorTable';
import SaleTypeTable from '../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../_components/AggregateFilterBar';
import ScorecardTabs from '../../_components/ScorecardTabs';
import { ChevronRight } from 'lucide-react';

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

export default async function RepScorecardPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ repCode: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { repCode } = await routeParams;
  const decodedRep = decodeURIComponent(repCode);

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

  const params: AggregateParams = {
    branchIds,
    repCode: decodedRep,
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  const fakeCustomerParams: ScorecardParams = {
    customerId: '',
    branchIds,
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  // For top customers, we can't easily filter by rep in fetchCustomerList without a join.
  // Show all-branch customers for this period; the rep-scoped KPIs are accurate.
  const [kpis, threeYear, productMajors, saleTypes] = await Promise.all([
    fetchAggregateKpis(params, decodedRep),
    fetchAggregateThreeYear(params),
    fetchAggregateProductMajors(params),
    fetchAggregateSaleTypes(params),
  ]);

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';

  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;
  const nsPctBase = kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null;
  const nsPctCompare = kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null;
  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;

  const repListUrl = `/scorecard/rep?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}${branchIds.map((b) => `&branch=${b}`).join('')}`;

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
        <Link href={repListUrl} className="text-sm text-cyan-400 hover:underline">
          ← All Reps
        </Link>
      </div>

      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-white">
          Rep: {decodedRep}
          <span className="text-slate-400 font-normal text-base ml-2">Sales Rep Scorecard</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{baseYear} vs {compareYear}</span>
          <span className="text-slate-600">·</span>
          <span>{periodLabel}</span>
        </div>
      </div>

      <AggregateFilterBar
        basePath={`/scorecard/rep/${encodeURIComponent(decodedRep)}`}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
        repCode={decodedRep}
      />

      <Section title="3-Year Comparison">
        <ComparisonTable entries={threeYear} />
      </Section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile label="Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
        <KpiTile label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
        <KpiTile label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
        <KpiTile label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
        <KpiTile label="Non-Stock %" base={nsPctBase} compare={nsPctCompare} format="percent" higherIsBetter={false} />
      </div>

      <Section title="Product Mix">
        <ProductMajorTable
          rows={productMajors}
          params={fakeCustomerParams}
          baseYear={baseYear}
          compareYear={compareYear}
          minorsApiPath="/api/scorecard/aggregate"
          extraParams={{ rep: decodedRep }}
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
