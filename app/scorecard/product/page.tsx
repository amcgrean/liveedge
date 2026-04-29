import { fetchProductScorecardMajors } from '../../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../../src/lib/scorecard/types';
import AggregateFilterBar from '../_components/AggregateFilterBar';
import ScorecardTabs from '../_components/ScorecardTabs';
import ProductScorecardTable from './components/ProductScorecardTable';
import ExportTableButton from '../../../src/components/shared/ExportTableButton';
import { ProductScorecardTreemap, ProductScorecardPareto } from '../_components/ScorecardCharts';

export const metadata = { title: 'Product Group Scorecard — Beisser LiveEdge' };

export default async function ProductScorecardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  function str(v: string | string[] | undefined, fallback: string) {
    return (Array.isArray(v) ? v[0] : v) ?? fallback;
  }

  const baseYear = parseInt(str(sp.baseYear, String(currentYear)), 10);
  const compareYear = parseInt(str(sp.compareYear, String(currentYear - 1)), 10);
  const period = (str(sp.period, 'YTD')) as AggregateParams['period'];
  const cutoffDate = str(sp.cutoffDate, today);
  const branchIds = (Array.isArray(sp.branch) ? sp.branch : sp.branch ? [sp.branch] : []).filter(Boolean);

  const params: AggregateParams = { branchIds, baseYear, compareYear, period, cutoffDate };
  const majors = await fetchProductScorecardMajors(params);

  const exportData = majors.map((r) => ({
    'Product Group': r.productMajor,
    Code: r.productMajorCode,
    [`${baseYear} Sales`]: r.salesBase,
    [`${baseYear} GP`]: r.gpBase,
    'GM%': r.salesBase ? `${((r.gpBase / r.salesBase) * 100).toFixed(1)}%` : '—',
    [`${baseYear} Orders`]: r.soCountBase,
    [`${baseYear} Qty`]: r.qtyBase,
    [`${compareYear} Sales`]: r.salesCompare,
    [`${compareYear} GP`]: r.gpCompare,
  }));

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
      <ScorecardTabs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Product Group Scorecard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Sales, margin, order counts, and quantity across all customers — click any group to drill down
          </p>
        </div>
      </div>

      <AggregateFilterBar
        basePath="/scorecard/product"
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ProductScorecardTreemap rows={majors} />
        <ProductScorecardPareto rows={majors} />
      </div>

      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Product Mix — {baseYear}{branchIds.length > 0 ? ` · ${branchIds.join(', ')}` : ' · All Branches'}
          </h2>
          <ExportTableButton data={exportData} filename={`product-groups-${baseYear}`} className="print:hidden" />
        </div>
        {majors.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No data for the selected period.</p>
        ) : (
          <ProductScorecardTable
            rows={majors}
            params={params}
            baseYear={baseYear}
            compareYear={compareYear}
          />
        )}
      </section>
    </div>
  );
}
