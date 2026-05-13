import { notFound } from 'next/navigation';
import {
  fetchProductHeader,
  fetchProductKpis,
  fetchProductThreeYear,
  fetchProductTopCustomers,
  fetchProductBranchMix,
  fetchProductSaleTypes,
} from '../../../../../../src/lib/scorecard/product-drill-queries';
import { fetchAggregateProductItems } from '../../../../../../src/lib/scorecard/queries';
import type {
  ProductDrillParams,
  ProductFilter,
  KpiComparison,
} from '../../../../../../src/lib/scorecard/types';
import KpiTile from '../../../../[customerId]/components/KpiTile';
import ComparisonTable from '../../../../[customerId]/components/ComparisonTable';
import SaleTypeTable from '../../../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../../../_components/AggregateFilterBar';
import ScorecardTabs from '../../../../_components/ScorecardTabs';
import {
  ThreeYearChart,
  TopCustomersPareto,
  SaleTypeParetoChart,
  BranchContributionPareto,
} from '../../../../_components/ScorecardCharts';
import ScorecardBreadcrumb from '@/components/scorecard/ScorecardBreadcrumb';
import Breadcrumb from '@/components/Breadcrumb';
import ProductDrillBreakdownTable from '../../../_components/ProductDrillBreakdownTable';

export const maxDuration = 60;

const NO_DTP = { base: null, compare: null };

const EMPTY_KPIS: KpiComparison = {
  base: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
    grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
  compare: { sales: null, gp: null, vaSales: null, nsSales: null, nsGp: null,
    grossSales: null, cmSales: null, soCount: null, cmCount: null, totalWeight: null },
  branchIds: [], shipToCount: 0, customerName: '',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProductMinorScorecard({
  params,
  searchParams,
}: {
  params: Promise<{ majorCode: string; minorCode: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { majorCode: rawMajor, minorCode: rawMinor } = await params;
  const majorCode = decodeURIComponent(rawMajor);
  const minorCode = decodeURIComponent(rawMinor);
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = (String(sp.period ?? 'YTD')) as ProductDrillParams['period'];
  const cutoffDate = String(sp.cutoffDate ?? today);
  const branchIds = sp.branch ? (Array.isArray(sp.branch) ? sp.branch : [sp.branch]) : [];
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  const productFilter: ProductFilter = { level: 'minor', majorCode, minorCode };
  const drillParams: ProductDrillParams = {
    productFilter, branchIds, baseYear, compareYear, period, cutoffDate,
  };
  const aggParams = { branchIds, baseYear, compareYear, period, cutoffDate };

  const [headerRes, kpisRes, threeYearRes, topCustomersRes, branchMixRes, saleTypesRes, itemsRes] =
    await Promise.allSettled([
      fetchProductHeader(productFilter),
      fetchProductKpis(drillParams, `${majorCode} · ${minorCode}`),
      fetchProductThreeYear(drillParams),
      fetchProductTopCustomers(drillParams, 15),
      fetchProductBranchMix(drillParams),
      fetchProductSaleTypes(drillParams),
      fetchAggregateProductItems(aggParams, majorCode, minorCode),
    ]);

  const failures: string[] = [];
  const logFail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      failures.push(name);
      console.error(`[scorecard/product/minor/${majorCode}/${minorCode}] ${name}:`, r.reason);
    }
  };
  logFail('header', headerRes);
  logFail('kpis', kpisRes);
  logFail('three-year', threeYearRes);
  logFail('top customers', topCustomersRes);
  logFail('branch mix', branchMixRes);
  logFail('sale types', saleTypesRes);
  logFail('items', itemsRes);

  const header = headerRes.status === 'fulfilled' ? headerRes.value : null;
  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : { ...EMPTY_KPIS, customerName: `${majorCode}/${minorCode}` };
  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const topCustomers = topCustomersRes.status === 'fulfilled' ? topCustomersRes.value : [];
  const branchMix = branchMixRes.status === 'fulfilled' ? branchMixRes.value : [];
  const saleTypes = saleTypesRes.status === 'fulfilled' ? saleTypesRes.value : [];
  const items = itemsRes.status === 'fulfilled' ? itemsRes.value : [];

  if (!header && (!kpis.base.sales && !kpis.compare.sales)) notFound();

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';
  const gmPctBase = kpis.base.sales && kpis.base.gp !== null ? kpis.base.gp / kpis.base.sales : null;
  const gmPctCompare = kpis.compare.sales && kpis.compare.gp !== null ? kpis.compare.gp / kpis.compare.sales : null;
  const vaPctBase = kpis.base.sales && kpis.base.vaSales !== null ? kpis.base.vaSales / kpis.base.sales : null;
  const vaPctCompare = kpis.compare.sales && kpis.compare.vaSales !== null ? kpis.compare.vaSales / kpis.compare.sales : null;
  const nsPctBase = kpis.base.sales && kpis.base.nsSales !== null ? kpis.base.nsSales / kpis.base.sales : null;
  const nsPctCompare = kpis.compare.sales && kpis.compare.nsSales !== null ? kpis.compare.nsSales / kpis.compare.sales : null;

  const childQs = (() => {
    const qsp = new URLSearchParams();
    qsp.set('baseYear', String(baseYear));
    qsp.set('compareYear', String(compareYear));
    qsp.set('period', period);
    qsp.set('cutoffDate', cutoffDate);
    branchIds.forEach((b) => qsp.append('branch', b));
    return `?${qsp.toString()}`;
  })();

  const title = header?.minorName ?? minorCode;
  const subtitle = header?.majorName ?? majorCode;
  const fromHint = `product-minor:${majorCode}|${minorCode}`;

  return (
    <>
      <Breadcrumb
        items={[
          { href: `/scorecard/overview${childQs}`, label: 'Scorecards' },
          { href: `/scorecard/product${childQs}`, label: 'Product Groups' },
          { href: `/scorecard/product/major/${encodeURIComponent(majorCode)}${childQs}`, label: subtitle },
          { label: title },
        ]}
      />
      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
        <ScorecardTabs />
        <ScorecardBreadcrumb from={from} fallback="product" />

      {failures.length > 0 && (
        <div className="p-3 bg-amber-900/30 border border-amber-700/60 rounded-lg text-amber-200 text-sm print:hidden">
          Some sections failed to load: {failures.join(', ')}. Showing available data.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">
          {title}
          <span className="font-normal text-base ml-2 text-slate-400">Product Minor Scorecard</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-0.5 text-slate-400 font-mono">
          <span>
            <a href={`/scorecard/product/major/${encodeURIComponent(majorCode)}${childQs}`} className="hover:text-cyan-400 transition">
              {subtitle} ({majorCode})
            </a>
            <span className="mx-1">›</span>
            <span>{minorCode}</span>
          </span>
          <span>·</span>
          <span>{baseYear} vs {compareYear}</span>
          <span>·</span>
          <span>{periodLabel}</span>
        </div>
      </div>

      <AggregateFilterBar
        basePath={`/scorecard/product/minor/${encodeURIComponent(majorCode)}/${encodeURIComponent(minorCode)}`}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <ThreeYearChart entries={threeYear} />

      <Section title="3-Year Comparison">
        <ComparisonTable entries={threeYear} exportFilename={`${majorCode}-${minorCode}-3year`} />
      </Section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiTile label="Sales" base={kpis.base.sales} compare={kpis.compare.sales} format="currency" />
        <KpiTile label="Gross Profit" base={kpis.base.gp} compare={kpis.compare.gp} format="currency" />
        <KpiTile label="Gross Margin %" base={gmPctBase} compare={gmPctCompare} format="percent" />
        <KpiTile label="Value Add %" base={vaPctBase} compare={vaPctCompare} format="percent" />
        <KpiTile label="Non-Stock %" base={nsPctBase} compare={nsPctCompare} format="percent" higherIsBetter={false} />
      </div>

      <BranchContributionPareto rows={branchMix} />
      <TopCustomersPareto rows={topCustomers} />

      <Section title="Top Customers Buying This Minor">
        <TopCustomersList rows={topCustomers} baseYear={baseYear} compareYear={compareYear} fromHint={fromHint} qs={childQs} />
      </Section>

      <Section title={`Items in ${title}`}>
        <ProductDrillBreakdownTable
          rows={items.map((it) => ({
            code: it.itemNumber,
            label: it.itemDescription || it.itemNumber,
            salesBase: it.salesBase,
            gpBase: it.gpBase,
            salesCompare: it.salesCompare,
            gpCompare: it.gpCompare,
            qtyBase: it.qtyBase,
          }))}
          level="item"
          majorCode={majorCode}
          minorCode={minorCode}
          baseYear={baseYear}
          compareYear={compareYear}
          fromHint={fromHint}
          qs={childQs}
          exportFilename={`${majorCode}-${minorCode}-items-${baseYear}`}
        />
      </Section>

      <SaleTypeParetoChart rows={saleTypes} baseYear={baseYear} />
      <Section title="Sales by Type">
        <SaleTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
      </Section>

      <Section title="Detail Metrics">
        <BottomMetrics kpis={kpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
      </Section>
      </div>
    </>
  );
}

function TopCustomersList({
  rows,
  baseYear,
  compareYear,
  fromHint,
  qs,
}: {
  rows: Array<{ customerId: string; customerName: string; salesBase: number; salesCompare: number; gpBase: number; branchIds: string[] }>;
  baseYear: number;
  compareYear: number;
  fromHint: string;
  qs: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 italic">No customer activity for this period.</p>;
  }
  const fmt$ = (n: number) => n
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
    : '—';
  const fmtPct = (s: number, g: number) => s ? `${((g / s) * 100).toFixed(1)}%` : '—';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            <th className="pb-2 text-left text-slate-400 font-medium">Customer</th>
            <th className="pb-2 text-right text-slate-300 pr-3">{baseYear} Sales</th>
            <th className="pb-2 text-right text-slate-300 pr-3">{baseYear} GM%</th>
            <th className="pb-2 text-right text-slate-400">{compareYear} Sales</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.customerId} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
              <td className="py-1.5">
                <a
                  href={`/scorecard/${encodeURIComponent(c.customerId)}${qs}&from=${encodeURIComponent(fromHint)}`}
                  className="text-white hover:text-cyan-400 transition"
                >
                  {c.customerName}
                  <span className="text-slate-500 italic text-xs ml-1">{c.customerId}</span>
                </a>
              </td>
              <td className={`py-1.5 text-right font-mono tabular-nums pr-3 ${c.salesBase > c.salesCompare ? 'text-emerald-400' : c.salesBase < c.salesCompare ? 'text-red-400' : 'text-slate-300'}`}>
                {fmt$(c.salesBase)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums text-cyan-400 pr-3">{fmtPct(c.salesBase, c.gpBase)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-slate-500">{fmt$(c.salesCompare)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
