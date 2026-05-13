import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Truck, ExternalLink, Star } from 'lucide-react';
import {
  fetchProductHeader,
  fetchProductKpis,
  fetchProductThreeYear,
  fetchProductTopCustomers,
  fetchProductBranchMix,
  fetchProductSaleTypes,
  fetchItemSuppliers,
} from '../../../../../src/lib/scorecard/product-drill-queries';
import type {
  ProductDrillParams,
  ProductFilter,
  KpiComparison,
  ItemSupplierRow,
} from '../../../../../src/lib/scorecard/types';
import KpiTile from '../../../[customerId]/components/KpiTile';
import ComparisonTable from '../../../[customerId]/components/ComparisonTable';
import SaleTypeTable from '../../../[customerId]/components/SaleTypeTable';
import BottomMetrics from '../../../[customerId]/components/BottomMetrics';
import AggregateFilterBar from '../../../_components/AggregateFilterBar';
import ScorecardTabs from '../../../_components/ScorecardTabs';
import {
  ThreeYearChart,
  TopCustomersPareto,
  SaleTypeParetoChart,
  BranchContributionPareto,
} from '../../../_components/ScorecardCharts';
import ScorecardBreadcrumb from '@/components/scorecard/ScorecardBreadcrumb';

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

export default async function ProductItemScorecard({
  params,
  searchParams,
}: {
  params: Promise<{ itemCode: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { itemCode: rawCode } = await params;
  const itemCode = decodeURIComponent(rawCode);
  const sp = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = (String(sp.period ?? 'YTD')) as ProductDrillParams['period'];
  const cutoffDate = String(sp.cutoffDate ?? today);
  const branchIds = sp.branch ? (Array.isArray(sp.branch) ? sp.branch : [sp.branch]) : [];
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  const productFilter: ProductFilter = { level: 'item', itemCode };
  const drillParams: ProductDrillParams = {
    productFilter, branchIds, baseYear, compareYear, period, cutoffDate,
  };

  const [headerRes, kpisRes, threeYearRes, topCustomersRes, branchMixRes, saleTypesRes, suppliersRes] =
    await Promise.allSettled([
      fetchProductHeader(productFilter),
      fetchProductKpis(drillParams, itemCode),
      fetchProductThreeYear(drillParams),
      fetchProductTopCustomers(drillParams, 15),
      fetchProductBranchMix(drillParams),
      fetchProductSaleTypes(drillParams),
      fetchItemSuppliers(itemCode),
    ]);

  const failures: string[] = [];
  const logFail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      failures.push(name);
      console.error(`[scorecard/product/item/${itemCode}] ${name}:`, r.reason);
    }
  };
  logFail('header', headerRes);
  logFail('kpis', kpisRes);
  logFail('three-year', threeYearRes);
  logFail('top customers', topCustomersRes);
  logFail('branch mix', branchMixRes);
  logFail('sale types', saleTypesRes);
  logFail('suppliers', suppliersRes);

  const header = headerRes.status === 'fulfilled' ? headerRes.value : null;
  const kpis = kpisRes.status === 'fulfilled' ? kpisRes.value : { ...EMPTY_KPIS, customerName: itemCode };
  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const topCustomers = topCustomersRes.status === 'fulfilled' ? topCustomersRes.value : [];
  const branchMix = branchMixRes.status === 'fulfilled' ? branchMixRes.value : [];
  const saleTypes = saleTypesRes.status === 'fulfilled' ? saleTypesRes.value : [];
  const suppliers = suppliersRes.status === 'fulfilled' ? suppliersRes.value : [];
  const primarySupplier = suppliers.find((s) => s.isPrimary) ?? null;

  if (!header && !kpis.base.sales && !kpis.compare.sales) notFound();

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

  const title = header?.itemDescription ?? itemCode;
  const fromHint = `product-item:${itemCode}`;

  return (
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
          <span className="font-normal text-base ml-2 text-slate-400">Item Scorecard</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-0.5 text-slate-400 font-mono">
          <span>{itemCode}</span>
          {header?.majorCode && (
            <>
              <span>·</span>
              <span>
                <Link
                  href={`/scorecard/product/major/${encodeURIComponent(header.majorCode)}${childQs}`}
                  className="hover:text-cyan-400 transition"
                >
                  {header.majorName} ({header.majorCode})
                </Link>
                {header.minorCode && (
                  <>
                    <span className="mx-1">›</span>
                    <Link
                      href={`/scorecard/product/minor/${encodeURIComponent(header.majorCode)}/${encodeURIComponent(header.minorCode)}${childQs}`}
                      className="hover:text-cyan-400 transition"
                    >
                      {header.minorName} ({header.minorCode})
                    </Link>
                  </>
                )}
              </span>
            </>
          )}
          <span>·</span>
          <span>{baseYear} vs {compareYear}</span>
          <span>·</span>
          <span>{periodLabel}</span>
        </div>
      </div>

      <AggregateFilterBar
        basePath={`/scorecard/product/item/${encodeURIComponent(itemCode)}`}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <ThreeYearChart entries={threeYear} />
        </div>
        <PrimarySupplierCard supplier={primarySupplier} itemCode={itemCode} childQs={childQs} fromHint={fromHint} />
      </div>

      <Section title="3-Year Comparison">
        <ComparisonTable entries={threeYear} exportFilename={`${itemCode}-3year`} />
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

      <Section title="Top Customers Buying This Item">
        <TopCustomersList rows={topCustomers} baseYear={baseYear} compareYear={compareYear} fromHint={fromHint} qs={childQs} />
      </Section>

      {suppliers.length > 0 && (
        <Section title={`Suppliers (${suppliers.length})`}>
          <SuppliersTable suppliers={suppliers} fromHint={fromHint} childQs={childQs} />
        </Section>
      )}

      <SaleTypeParetoChart rows={saleTypes} baseYear={baseYear} />
      <Section title="Sales by Type">
        <SaleTypeTable rows={saleTypes} baseYear={baseYear} compareYear={compareYear} />
      </Section>

      <Section title="Detail Metrics">
        <BottomMetrics kpis={kpis} daysToPay={NO_DTP} baseYear={baseYear} compareYear={compareYear} />
      </Section>
    </div>
  );
}

function PrimarySupplierCard({
  supplier,
  itemCode,
  childQs,
  fromHint,
}: {
  supplier: ItemSupplierRow | null;
  itemCode: string;
  childQs: string;
  fromHint: string;
}) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5" />
        Primary Supplier
      </h2>
      {supplier ? (
        <Link
          href={`/scorecard/vendor/${encodeURIComponent(supplier.supplierKey)}${childQs}&from=${encodeURIComponent(fromHint)}`}
          className="block group"
        >
          <div className="text-lg font-semibold text-white group-hover:text-cyan-400 transition flex items-center gap-1.5">
            {supplier.supplierName ?? supplier.supplierCode}
            <ExternalLink className="w-4 h-4 opacity-60" />
          </div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono">
            {supplier.supplierCode}
            {supplier.shipFromSeqNum && supplier.shipFromSeqNum > 1 && (
              <span className="ml-1.5">· ship-from {supplier.shipFromSeqNum}</span>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-slate-500">Lead time</dt>
            <dd className="text-slate-200 font-mono tabular-nums text-right">
              {formatLeadTimes(supplier.leadTimes)}
            </dd>
            {supplier.minOrderQty > 0 && (
              <>
                <dt className="text-slate-500">Min order</dt>
                <dd className="text-slate-200 font-mono tabular-nums text-right">
                  {supplier.minOrderQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {supplier.minOrderQtyDispUom && (
                    <span className="text-slate-500 ml-1">{supplier.minOrderQtyDispUom}</span>
                  )}
                </dd>
              </>
            )}
            {supplier.minPak > 0 && (
              <>
                <dt className="text-slate-500">Min pak</dt>
                <dd className="text-slate-200 font-mono tabular-nums text-right">
                  {supplier.minPak.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  {supplier.minPakDispUom && (
                    <span className="text-slate-500 ml-1">{supplier.minPakDispUom}</span>
                  )}
                </dd>
              </>
            )}
            {supplier.supplierUom && (
              <>
                <dt className="text-slate-500">Supplier UOM</dt>
                <dd className="text-slate-200 font-mono tabular-nums text-right">{supplier.supplierUom}</dd>
              </>
            )}
          </dl>
          <div className="mt-3 text-xs text-cyan-400 group-hover:text-cyan-300 transition">
            View vendor scorecard →
          </div>
        </Link>
      ) : (
        <div className="text-sm text-slate-500">
          <p>No primary supplier mapped for <span className="font-mono">{itemCode}</span>.</p>
          <p className="text-xs mt-1 italic">
            Check <code>agility_item_supplier.is_primary</code> for this item.
          </p>
        </div>
      )}
    </section>
  );
}

function formatLeadTimes(tiers: Array<number | null>): string {
  const positive = tiers.filter((v): v is number => v !== null && v > 0);
  if (positive.length === 0) return '—';
  if (positive.length === 1) return `${positive[0]}d`;
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  if (min === max) return `${min}d`;
  return `${min}–${max}d`;
}

function SuppliersTable({
  suppliers,
  fromHint,
  childQs,
}: {
  suppliers: ItemSupplierRow[];
  fromHint: string;
  childQs: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="pb-2">Supplier</th>
            <th className="pb-2 text-right pr-3">Lead Time</th>
            <th className="pb-2 text-right pr-3">Min Order</th>
            <th className="pb-2 text-right pr-3">Min Pak</th>
            <th className="pb-2 text-left pr-3">Supp UOM</th>
            <th className="pb-2 text-left">UOM Steps</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => {
            const uomSteps: string[] = [];
            if (s.useUomForPoEntry) uomSteps.push('Entry');
            if (s.useUomForPrintedPo) uomSteps.push('Printed');
            if (s.useUomForPoCheckIn) uomSteps.push('Check-in');
            if (s.useUomForReceiving) uomSteps.push('Receiving');
            const minOrderAlert = s.minOrderViolation === 'Block';
            const minPakAlert = s.minPakViolation === 'Block';
            return (
              <tr key={`${s.supplierKey}-${s.shipFromSeqNum ?? 0}`} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/scorecard/vendor/${encodeURIComponent(s.supplierKey)}${childQs}&from=${encodeURIComponent(fromHint)}`}
                    className="inline-flex items-center gap-1.5 text-white hover:text-cyan-400 transition"
                  >
                    {s.isPrimary && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                    <span>{s.supplierName ?? s.supplierCode}</span>
                    <span className="text-slate-500 italic text-xs">{s.supplierCode}</span>
                    {s.shipFromSeqNum && s.shipFromSeqNum > 1 && (
                      <span className="text-slate-600 text-xs">· #{s.shipFromSeqNum}</span>
                    )}
                    <ExternalLink className="w-3 h-3 text-slate-600" />
                  </Link>
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 pr-3">
                  {formatLeadTimes(s.leadTimes)}
                </td>
                <td className={`py-1.5 text-right font-mono tabular-nums pr-3 ${minOrderAlert ? 'text-amber-400' : 'text-slate-300'}`}>
                  {s.minOrderQty > 0
                    ? <>{s.minOrderQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}{s.minOrderQtyDispUom && <span className="text-slate-500 ml-1">{s.minOrderQtyDispUom}</span>}</>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className={`py-1.5 text-right font-mono tabular-nums pr-3 ${minPakAlert ? 'text-amber-400' : 'text-slate-300'}`}>
                  {s.minPak > 0
                    ? <>{s.minPak.toLocaleString(undefined, { maximumFractionDigits: 2 })}{s.minPakDispUom && <span className="text-slate-500 ml-1">{s.minPakDispUom}</span>}</>
                    : <span className="text-slate-600">—</span>}
                </td>
                <td className="py-1.5 pr-3 text-slate-300 font-mono text-xs">{s.supplierUom || <span className="text-slate-600">—</span>}</td>
                <td className="py-1.5 text-slate-400 text-xs">
                  {uomSteps.length > 0 ? uomSteps.join(' · ') : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-500 mt-2">
        Star = primary supplier. UOM steps mark where the supplier&apos;s UOM (not the stocking UOM) is used. Min-order / min-pak values in amber indicate &quot;Block&quot; violation rules.
      </p>
    </div>
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
