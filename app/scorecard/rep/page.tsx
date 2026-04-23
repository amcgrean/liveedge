import Link from 'next/link';
import { fetchRepList } from '../../../src/lib/scorecard/queries';
import ScorecardTabs from '../_components/ScorecardTabs';
import AggregateFilterBar from '../_components/AggregateFilterBar';
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              <th className="pb-2 text-slate-400 font-medium" rowSpan={2}>Rep</th>
              {/* Assigned book columns */}
              <th className="pb-1 text-cyan-400/80 font-medium text-right pr-4 text-xs" colSpan={3}>
                Assigned Book (rep_1)
              </th>
              {/* Written-up columns */}
              <th className="pb-1 text-amber-400/80 font-medium text-right pr-4 text-xs border-l border-slate-700 pl-4" colSpan={3}>
                Written Up (rep_3)
              </th>
            </tr>
            <tr className="border-b border-slate-700">
              <th className="pb-2 text-slate-300 font-semibold text-right pr-4">{baseYear} Sales</th>
              <th className="pb-2 text-slate-300 font-semibold text-right pr-4">{compareYear}</th>
              <th className="pb-2 text-slate-300 font-semibold text-right pr-4">GM%</th>
              <th className="pb-2 text-slate-300 font-semibold text-right pr-4 border-l border-slate-700 pl-4">{baseYear} Sales</th>
              <th className="pb-2 text-slate-300 font-semibold text-right pr-4">{compareYear}</th>
              <th className="pb-2 text-slate-300 font-semibold text-right">GM%</th>
            </tr>
          </thead>
          <tbody>
            {reps.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  No rep data found — verify rep_1 and rep_3 columns exist in agility_so_header
                </td>
              </tr>
            )}
            {reps.map((r) => {
              const qs = `baseYear=${baseYear}&compareYear=${compareYear}&period=${period}&cutoffDate=${cutoffDate}${branchIds.map((b) => `&branch=${b}`).join('')}`;
              return (
                <tr
                  key={r.repCode}
                  className="border-b border-slate-800 hover:bg-slate-800/40 transition group"
                >
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/scorecard/rep/${encodeURIComponent(r.repCode)}?${qs}`}
                      className="flex items-center gap-1 group-hover:text-cyan-400 transition"
                    >
                      <span className="font-medium text-white">{r.repCode}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 ml-auto" />
                    </Link>
                  </td>
                  {/* Assigned */}
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${deltaClass(r.assignedSalesBase, r.assignedSalesCompare)}`}>
                    {fmt$(r.assignedSalesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(r.assignedSalesCompare)}</td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">{fmtPct(r.assignedSalesBase, r.assignedGpBase)}</td>
                  {/* Written */}
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums border-l border-slate-800 pl-4 ${deltaClass(r.writtenSalesBase, r.writtenSalesCompare)}`}>
                    {fmt$(r.writtenSalesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">{fmt$(r.writtenSalesCompare)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">{fmtPct(r.writtenSalesBase, r.writtenGpBase)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {reps.length > 0 && (
        <p className="text-xs text-slate-500 text-right">{reps.length} sales reps shown</p>
      )}
    </div>
  );
}
