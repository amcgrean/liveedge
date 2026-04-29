import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fetchKpis,
  fetchAllCustomersAvg,
  fetchThreeYear,
  fetchProductMajors,
  fetchSaleTypes,
  fetchDaysToPay,
} from '../../../src/lib/scorecard/queries';
import type { ScorecardParams } from '../../../src/lib/scorecard/types';
import KpiTile from './components/KpiTile';
import ComparisonTable from './components/ComparisonTable';
import ProductMajorTable from './components/ProductMajorTable';
import SaleTypeTable from './components/SaleTypeTable';
import BottomMetrics from './components/BottomMetrics';
import FilterBar from './FilterBar';
import {
  ThreeYearChart,
  ProductMixTreemap,
  SaleTypeParetoChart,
  DaysToPayCard,
} from '../_components/ScorecardCharts';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
  '30CD': 'Cedar',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

export default async function ScorecardPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = (String(sp.period ?? 'YTD')) as ScorecardParams['period'];
  const cutoffDate = String(sp.cutoffDate ?? today);
  const branchIds = sp.branch
    ? Array.isArray(sp.branch) ? sp.branch : [sp.branch]
    : [];

  const scorecardParams: ScorecardParams = {
    customerId: decodeURIComponent(customerId),
    branchIds,
    baseYear,
    compareYear,
    period,
    cutoffDate,
  };

  const [kpis, avg, threeYear, productMajors, saleTypes, daysToPay] = await Promise.all([
    fetchKpis(scorecardParams),
    fetchAllCustomersAvg(scorecardParams),
    fetchThreeYear(scorecardParams),
    fetchProductMajors(scorecardParams),
    fetchSaleTypes(scorecardParams),
    fetchDaysToPay(scorecardParams),
  ]);

  if (!kpis.customerName && !kpis.base.sales) notFound();

  const periodLabel =
    period === 'YTD'
      ? `YTD thru ${cutoffDate}`
      : 'Full Year';

  const branchLabel =
    branchIds.length === 0
      ? kpis.branchIds.length === 1
        ? (BRANCH_LABELS[kpis.branchIds[0]] ?? kpis.branchIds[0])
        : 'Multiple Branches'
      : branchIds.length === 1
        ? (BRANCH_LABELS[branchIds[0]] ?? branchIds[0])
        : 'Multiple Branches';

  const vaPctBase =
    kpis.base.sales && kpis.base.sales !== 0 && kpis.base.vaSales !== null
      ? kpis.base.vaSales / kpis.base.sales
      : null;
  const vaPctCompare =
    kpis.compare.sales && kpis.compare.sales !== 0 && kpis.compare.vaSales !== null
      ? kpis.compare.vaSales / kpis.compare.sales
      : null;

  const nsPctBase =
    kpis.base.sales && kpis.base.sales !== 0 && kpis.base.nsSales !== null
      ? kpis.base.nsSales / kpis.base.sales
      : null;
  const nsPctCompare =
    kpis.compare.sales && kpis.compare.sales !== 0 && kpis.compare.nsSales !== null
      ? kpis.compare.nsSales / kpis.compare.sales
      : null;

  const gmPctBase =
    kpis.base.sales && kpis.base.sales !== 0 && kpis.base.gp !== null
      ? kpis.base.gp / kpis.base.sales
      : null;
  const gmPctCompare =
    kpis.compare.sales && kpis.compare.sales !== 0 && kpis.compare.gp !== null
      ? kpis.compare.gp / kpis.compare.sales
      : null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
          .print\\:text-xs { font-size: 0.7rem !important; }
          nav, header { display: none !important; }
        }
      `}</style>

      {/* Breadcrumb */}
      <div className="print:hidden">
        <Link href="/scorecard" className="text-sm text-cyan-400 hover:underline">
          ← Customer Scorecard
        </Link>
      </div>

      {/* Header */}
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-white">
          {kpis.customerName}
          <span className="text-slate-400 font-normal text-base ml-2">{scorecardParams.customerId}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{branchLabel}</span>
          <span className="text-slate-600">·</span>
          <span>{baseYear} vs {compareYear}</span>
          <span className="text-slate-600">·</span>
          <span>{periodLabel}</span>
          {kpis.shipToCount > 1 && (
            <>
              <span className="text-slate-600">·</span>
              <span>{kpis.shipToCount} ship-to locations</span>
            </>
          )}
        </div>
      </div>

      {/* Filter bar (client) */}
      <FilterBar
        customerId={scorecardParams.customerId}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <ThreeYearChart entries={threeYear} />

      {/* 3-year rolling table */}
      <Section title="3-Year Comparison">
        <ComparisonTable entries={threeYear} />
      </Section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile
          label="Sales"
          base={kpis.base.sales}
          compare={kpis.compare.sales}
          format="currency"
        />
        <KpiTile
          label="Gross Profit"
          base={kpis.base.gp}
          compare={kpis.compare.gp}
          format="currency"
        />
        <KpiTile
          label="Gross Margin %"
          base={gmPctBase}
          compare={gmPctCompare}
          format="percent"
          avg={avg.gmPct}
        />
        <KpiTile
          label="Value Add %"
          base={vaPctBase}
          compare={vaPctCompare}
          format="percent"
          avg={avg.vaPct}
        />
        <KpiTile
          label="Non-Stock %"
          base={nsPctBase}
          compare={nsPctCompare}
          format="percent"
          higherIsBetter={false}
          avg={avg.nsPct}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProductMixTreemap rows={productMajors} />
        </div>
        <DaysToPayCard daysToPay={daysToPay} customerAvg={avg} />
      </div>

      {/* Product mix */}
      <Section title="Product Mix">
        <ProductMajorTable
          rows={productMajors}
          params={scorecardParams}
          baseYear={baseYear}
          compareYear={compareYear}
          orderFrom={`/scorecard/${encodeURIComponent(customerId)}`}
          orderFromLabel={kpis.customerName ?? customerId}
        />
      </Section>

      <SaleTypeParetoChart rows={saleTypes} baseYear={baseYear} />

      {/* Sale type breakdown */}
      <Section title="Sales by Type">
        <SaleTypeTable
          rows={saleTypes}
          baseYear={baseYear}
          compareYear={compareYear}
        />
      </Section>

      {/* CFO bottom metrics */}
      <Section title="Detail Metrics">
        <BottomMetrics
          kpis={kpis}
          daysToPay={daysToPay}
          baseYear={baseYear}
          compareYear={compareYear}
        />
      </Section>

    </div>
  );
}
