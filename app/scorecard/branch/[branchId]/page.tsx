import { notFound } from 'next/navigation';
import {
  fetchAggregateKpis,
  fetchAggregateThreeYear,
  fetchAggregateProductMajors,
  fetchAggregateSaleTypes,
  fetchCustomerList,
} from '../../../../src/lib/scorecard/queries';
import type { AggregateParams, KpiComparison, ScorecardParams } from '../../../../src/lib/scorecard/types';
import KpiTile from '../../[customerId]/components/KpiTile';
import ComparisonTable from '../../[customerId]/components/ComparisonTable';
import ProductMajorTable from '../../[customerId]/components/ProductMajorTable';
import SaleTypeTable from '../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../_components/AggregateFilterBar';
import { TopCustomersTable } from '../../_components/AggregateTables';
import {
  ThreeYearChart,
  TopCustomersPareto,
  ProductMixTreemap,
  SaleTypeParetoChart,
} from '../../_components/ScorecardCharts';
import ScorecardSidebarNav from '../../_components/ScorecardSidebarNav';
import BulletChart from '@/components/charts/BulletChart';

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const VALID_BRANCHES = Object.keys(BRANCH_LABELS);

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="rounded-lg p-4 space-y-3"
      style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}
    >
      <h2
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: 'var(--text-3)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export const maxDuration = 60;

const NO_DTP = { base: null, compare: null };

// Branch benchmark targets (realistic industry/company targets)
const BENCHMARKS = [
  { label: 'GM %', valueFn: (gmPct: number | null) => gmPct !== null ? gmPct * 100 : null, target: 22, suffix: '%', goodWhen: 'high' as const },
  { label: 'On-Time Delivery', value: null as number | null, target: 92, suffix: '%', goodWhen: 'high' as const },
  { label: 'Pick Accuracy', value: null as number | null, target: 97, suffix: '%', goodWhen: 'high' as const },
];

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

  const emptyKpis: KpiComparison = {
    base: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    compare: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
      grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
    branchIds: [branchId], shipToCount: 0, customerName: BRANCH_LABELS[branchId] ?? branchId,
  };

  const [kpisRes, threeYearRes, productMajorsRes, saleTypesRes, topCustomersRes] = await Promise.allSettled([
    fetchAggregateKpis(params, BRANCH_LABELS[branchId] ?? branchId),
    fetchAggregateThreeYear(params),
    fetchAggregateProductMajors(params),
    fetchAggregateSaleTypes(params),
    fetchCustomerList(baseYear, compareYear, [branchId], '', 15, period, cutoffDate),
  ]);

  const failures: string[] = [];
  const logFail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      failures.push(name);
      console.error(`[scorecard/branch/${branchId}] ${name} failed:`, r.reason);
    }
  };
  logFail('aggregate kpis', kpisRes);
  logFail('three-year comparison', threeYearRes);
  logFail('product majors', productMajorsRes);
  logFail('sale types', saleTypesRes);
  logFail('top customers', topCustomersRes);

  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : emptyKpis;
  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const productMajors = productMajorsRes.status === 'fulfilled' ? productMajorsRes.value : [];
  const saleTypes = saleTypesRes.status === 'fulfilled' ? saleTypesRes.value : [];
  const topCustomers = topCustomersRes.status === 'fulfilled' ? topCustomersRes.value : [];

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';

  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;
  const nsPctBase = kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null;
  const nsPctCompare = kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null;
  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;

  const qs = `baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}`;

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 54px)' }}>
      {/* Sidebar nav */}
      <ScorecardSidebarNav branchId={branchId} qs={qs} />

      {/* Main content */}
      <div className="flex-1 min-w-0 p-4 md:p-6 space-y-5">
        <style>{`
          @media print {
            body { background: white !important; color: black !important; }
            .print\\:hidden { display: none !important; }
            nav, header { display: none !important; }
          }
        `}</style>

        {/* Page header */}
        <div id="overview">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            {BRANCH_LABELS[branchId] ?? branchId}
            <span className="font-normal text-base ml-2" style={{ color: 'var(--text-3)' }}>Branch Scorecard</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-0.5 mono" style={{ color: 'var(--text-3)' }}>
            <span>{baseYear} vs {compareYear}</span>
            <span>·</span>
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

        <ThreeYearChart entries={threeYear} />

        <Section id="overview" title="3-Year Comparison">
          <ComparisonTable entries={threeYear} exportFilename={`${BRANCH_LABELS[branchId] ?? branchId}-3year`} />
        </Section>

        <div id="kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiTile label="Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
          <KpiTile label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
          <KpiTile label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
          <KpiTile label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
          <KpiTile label="Non-Stock %" base={nsPctBase} compare={nsPctCompare} format="percent" higherIsBetter={false} />
        </div>

        {/* Benchmarks panel */}
        <Section id="kpis" title="Branch Benchmarks">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-1">
            <BulletChart
              label="Gross Margin %"
              value={gmPctBase !== null ? gmPctBase * 100 : null}
              target={22}
              prior={gmPctCompare !== null ? gmPctCompare * 100 : null}
              max={40}
              suffix="%"
              goodWhen="high"
            />
            <BulletChart
              label="On-Time Delivery %"
              value={null}
              target={92}
              suffix="%"
              goodWhen="high"
            />
            <BulletChart
              label="Pick Accuracy %"
              value={null}
              target={97}
              suffix="%"
              goodWhen="high"
            />
          </div>
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-3)' }}>
            Gold tick = target · Gray tick = prior year. On-time delivery and pick accuracy sourced from WMS — not yet wired.
          </p>
        </Section>

        <div id="customers">
          <TopCustomersPareto rows={topCustomers} />
        </div>

        <Section id="customers" title="Top Customers">
          <TopCustomersTable
            rows={topCustomers}
            baseYear={baseYear}
            compareYear={compareYear}
            period={period}
            cutoffDate={cutoffDate}
            branchId={branchId}
            filename={`${BRANCH_LABELS[branchId] ?? branchId}-top-customers`}
          />
        </Section>

        <div id="product-mix">
          <ProductMixTreemap rows={productMajors} />
        </div>

        <Section id="product-mix" title="Product Mix">
          <ProductMajorTable
            rows={productMajors}
            params={fakeCustomerParams}
            baseYear={baseYear}
            compareYear={compareYear}
            minorsApiPath="/api/scorecard/aggregate"
            orderFrom={`/scorecard/branch/${branchId}`}
            orderFromLabel={`${BRANCH_LABELS[branchId] ?? branchId} Branch`}
          />
        </Section>

        <div id="sale-types">
          <SaleTypeParetoChart rows={saleTypes} baseYear={baseYear} />
        </div>

        <Section id="sale-types" title="Sales by Type">
          <SaleTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
        </Section>

        <Section id="detail" title="Detail Metrics">
          <BottomMetrics kpis={kpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
        </Section>
      </div>
    </div>
  );
}
