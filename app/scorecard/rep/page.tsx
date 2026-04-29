import { fetchRepList } from '../../../src/lib/scorecard/queries';
import ScorecardTabs from '../_components/ScorecardTabs';
import AggregateFilterBar from '../_components/AggregateFilterBar';
import { RepComparisonChart } from '../_components/ScorecardCharts';
import RepListTable from './RepListTable';

export default async function RepListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = String(sp.period ?? 'YTD');
  const cutoffDate = String(sp.cutoffDate ?? today);
  const branchIds = sp.branch
    ? Array.isArray(sp.branch) ? sp.branch : [sp.branch]
    : [];

  const reps = await fetchRepList(baseYear, compareYear, cutoffDate, period, branchIds);

  const periodLabel = period === 'YTD' ? `YTD thru ${cutoffDate}` : 'Full Year';

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <ScorecardTabs />

      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold text-white">By Sales Rep</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span>{baseYear} vs {compareYear}</span>
          <span className="text-slate-600">·</span>
          <span>{periodLabel}</span>
          {reps.length > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <span>{reps.length} reps</span>
            </>
          )}
        </div>
      </div>

      <AggregateFilterBar
        basePath="/scorecard/rep"
        baseYear={baseYear}
        compareYear={compareYear}
        period={period as 'YTD' | 'Full Year'}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      <RepComparisonChart rows={reps} baseYear={baseYear} />

      <RepListTable
        rows={reps}
        baseYear={baseYear}
        compareYear={compareYear}
        period={period}
        cutoffDate={cutoffDate}
        branchIds={branchIds}
      />

      {reps.length > 0 && (
        <p className="text-xs text-slate-500 text-right">{reps.length} sales reps shown</p>
      )}
    </div>
  );
}
