import Link from 'next/link';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchAggregateProductMajors,
  fetchAggregateSaleTypes,
} from '../../../../src/lib/scorecard/queries';
import type { AggregateParams, ScorecardParams } from '../../../../src/lib/scorecard/types';
import KpiTile from '../../[customerId]/components/KpiTile';
import ComparisonTable from '../../[customerId]/components/ComparisonTable';
import ProductMajorTable from '../../[customerId]/components/ProductMajorTable';
import SaleTypeTable from '../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../_components/AggregateFilterBar';
import ScorecardTabs from '../../_components/ScorecardTabs';
import { ThreeYearChart, ProductMixTreemap } from '../../_components/ScorecardCharts';

const NO_DTP = { base: null, compare: null };

function SectionHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-lg font-bold text-white">{label}</h2>
      <span className="text-xs text-slate-400">{sub}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

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

  const assignedParams: AggregateParams = { branchIds, repCode: decodedRep, repField: 'rep_1', baseYear, compareYear, period, cutoffDate };
  const writtenParams: AggregateParams = { branchIds, repCode: decodedRep, repField: 'rep_3', baseYear, compareYear, period, cutoffDate };

  const fakeParams: ScorecardParams = { customerId: '', branchIds, baseYear, compareYear, period, cutoffDate };

  // Run all 8 queries in parallel
  const [
    assignedKpis, assignedThreeYear, assignedMajors, assignedSaleTypes,
    writtenKpis, writtenThreeYear, writtenMajors, writtenSaleTypes,
  ] = await Promise.all([
    fetchAggregateKpis(assignedParams, decodedRep),
    fetchAggregateThreeYear(assignedParams),
    fetchAggregateProductMajors(assignedParams),
    fetchAggregateSaleTypes(assignedParams),
    fetchAggregateKpis(writtenParams, decodedRep),
    fetchAggregateThreeYear(writtenParams),
    fetchAggregateProductMajors(writtenParams),
    fetchAggregateSaleTypes(writtenParams),
  ]);

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';
  const repListUrl = `/scorecard/rep?baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}${branchIds.map((b) => `&branch=${b}`).join('')}`;

  function kpiPcts(kpis: typeof assignedKpis) {
    return {
      gmPctBase: kpis.base.sales ? (kpis.base.gp ?? 0) / kpis.base.sales : null,
      gmPctCompare: kpis.compare.sales ? (kpis.compare.gp ?? 0) / kpis.compare.sales : null,
      vaPctBase: kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null,
      vaPctCompare: kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null,
      nsPctBase: kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null,
      nsPctCompare: kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null,
    };
  }

  const aP = kpiPcts(assignedKpis);
  const wP = kpiPcts(writtenKpis);

  const minorsBase = `/api/scorecard/aggregate`;
  const assignedExtra = { rep: decodedRep, repField: 'rep_1' };
  const writtenExtra = { rep: decodedRep, repField: 'rep_3' };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
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
        <h1 className="text-2xl font-bold text-white">Rep: {decodedRep}</h1>
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

      {/* ── Assigned Book (rep_1) ─────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <div className="h-px flex-1 bg-slate-700" />
          <SectionHeader label="Assigned Book" sub="Customers assigned to this rep (rep_1)" />
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        <ThreeYearChart entries={assignedThreeYear} />

        <Section title="3-Year Comparison">
          <ComparisonTable entries={assignedThreeYear} />
        </Section>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiTile label="Sales" base={assignedKpis.base.sales} compare={assignedKpis.compare.sales} format="currency" />
          <KpiTile label="Gross Profit" base={assignedKpis.base.gp} compare={assignedKpis.compare.gp} format="currency" />
          <KpiTile label="Gross Margin %" base={aP.gmPctBase} compare={aP.gmPctCompare} format="percent" />
          <KpiTile label="Value Add %" base={aP.vaPctBase} compare={aP.vaPctCompare} format="percent" />
          <KpiTile label="Non-Stock %" base={aP.nsPctBase} compare={aP.nsPctCompare} format="percent" higherIsBetter={false} />
        </div>

        <ProductMixTreemap rows={assignedMajors} />

        <Section title="Product Mix">
          <ProductMajorTable rows={assignedMajors} params={fakeParams} baseYear={baseYear} compareYear={compareYear}
            minorsApiPath={minorsBase} extraParams={assignedExtra} />
        </Section>
        <Section title="Sales by Type">
          <SaleTypeTable rows={assignedSaleTypes} baseYear={baseYear} compareYear={compareYear} />
        </Section>
        <Section title="Detail Metrics">
          <BottomMetrics kpis={assignedKpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
        </Section>
      </div>

      {/* ── Written Up (rep_3) ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 pt-4">
          <div className="h-px flex-1 bg-slate-700" />
          <SectionHeader label="Written Up" sub="Orders this rep entered, regardless of account assignment (rep_3)" />
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        <ThreeYearChart entries={writtenThreeYear} />

        <Section title="3-Year Comparison">
          <ComparisonTable entries={writtenThreeYear} />
        </Section>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiTile label="Sales" base={writtenKpis.base.sales} compare={writtenKpis.compare.sales} format="currency" />
          <KpiTile label="Gross Profit" base={writtenKpis.base.gp} compare={writtenKpis.compare.gp} format="currency" />
          <KpiTile label="Gross Margin %" base={wP.gmPctBase} compare={wP.gmPctCompare} format="percent" />
          <KpiTile label="Value Add %" base={wP.vaPctBase} compare={wP.vaPctCompare} format="percent" />
          <KpiTile label="Non-Stock %" base={wP.nsPctBase} compare={wP.nsPctCompare} format="percent" higherIsBetter={false} />
        </div>

        <ProductMixTreemap rows={writtenMajors} />

        <Section title="Product Mix">
          <ProductMajorTable rows={writtenMajors} params={fakeParams} baseYear={baseYear} compareYear={compareYear}
            minorsApiPath={minorsBase} extraParams={writtenExtra} />
        </Section>
        <Section title="Sales by Type">
          <SaleTypeTable rows={writtenSaleTypes} baseYear={baseYear} compareYear={compareYear} />
        </Section>
        <Section title="Detail Metrics">
          <BottomMetrics kpis={writtenKpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
        </Section>
      </div>
    </div>
  );
}
