import Link from 'next/link';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { fetchVendorList, fetchVendorScorecardSummary } from '../../../src/lib/vendor-scorecard/queries';
import type { VendorScorecardParams } from '../../../src/lib/vendor-scorecard/types';
import ScorecardTabs from '../_components/ScorecardTabs';

export const maxDuration = 60;
export const metadata = { title: 'Vendor Scorecards — Beisser LiveEdge' };

const BRANCHES = [
  { id: 'all', label: 'All Branches' },
  { id: '10FD', label: 'Fort Dodge' },
  { id: '20GR', label: 'Grimes' },
  { id: '25BW', label: 'Birchwood' },
  { id: '40CV', label: 'Coralville' },
];

const RANGES: VendorScorecardParams['range'][] = ['MTD', 'QTD', 'YTD', 'TTM', 'FY'];

function fmt$(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n.toFixed(1)}%`;
}

export default async function VendorScorecardListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const range = (RANGES.includes(String(sp.range ?? 'YTD') as VendorScorecardParams['range'])
    ? String(sp.range ?? 'YTD')
    : 'YTD') as VendorScorecardParams['range'];
  const branch = String(sp.branch ?? 'all');
  const search = String(sp.q ?? '').trim().toLowerCase();

  const params: VendorScorecardParams = { range, branch, productGroup: 'all' };

  const [summaryRes, vendorsRes] = await Promise.allSettled([
    fetchVendorScorecardSummary(params),
    fetchVendorList(params),
  ]);

  const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
  const vendors = vendorsRes.status === 'fulfilled' ? vendorsRes.value : [];

  const filtered = search
    ? vendors.filter(
        (v) =>
          v.supplierName.toLowerCase().includes(search) ||
          v.supplierCode.toLowerCase().includes(search) ||
          (v.primaryProductGroup ?? '').toLowerCase().includes(search),
      )
    : vendors;

  return (
    <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
      <ScorecardTabs />

      <div>
        <h1 className="text-2xl font-bold text-white">Vendor Scorecards</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Spend, fill rate, and on-time performance by supplier. Click a vendor to drill into their scorecard.
        </p>
      </div>

      {/* Compact filter bar */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Range</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/scorecard/vendor?range=${r}&branch=${branch}`}
                className={`px-3 py-2 text-sm font-medium transition ${
                  range === r ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                {r}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Branch</label>
          <div className="flex flex-wrap gap-1">
            {BRANCHES.map((b) => (
              <Link
                key={b.id}
                href={`/scorecard/vendor?range=${range}&branch=${b.id}`}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                  branch === b.id ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                {b.label}
              </Link>
            ))}
          </div>
        </div>

        <form className="ml-auto">
          <input type="hidden" name="range" value={range} />
          <input type="hidden" name="branch" value={branch} />
          <label className="block text-xs text-slate-400 mb-1">Search</label>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Supplier name, code, or product group"
            className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500 w-80"
          />
        </form>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Total Spend YTD</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmt$(summary.totalSpendYTD)}</div>
            <div className="text-xs text-slate-500 mt-0.5">vs {fmt$(summary.totalSpendPY)} PY</div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Rebate Earned</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmt$(summary.totalRebateEarned)}</div>
            <div className="text-xs text-slate-500 mt-0.5">+ {fmt$(summary.totalRebateAccrued)} accrued</div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Avg Fill Rate</div>
            <div className={`text-xl font-bold tabular-nums mt-1 ${(summary.avgFillRatePct ?? 100) < 90 ? 'text-amber-400' : 'text-white'}`}>
              {fmtPct(summary.avgFillRatePct)}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Avg On-Time %</div>
            <div className={`text-xl font-bold tabular-nums mt-1 ${(summary.avgOtdPct ?? 100) < 85 ? 'text-amber-400' : 'text-white'}`}>
              {fmtPct(summary.avgOtdPct)}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400 uppercase tracking-wider">Top 3 Concentration</div>
            <div className="text-xl font-bold text-white tabular-nums mt-1">{fmtPct(summary.top3ConcentrationPct)}</div>
            <div className="text-xs text-slate-500 mt-0.5">of total YTD spend</div>
          </div>
        </div>
      )}

      <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
          Vendors ({filtered.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="pb-2">Vendor</th>
                <th className="pb-2 text-right pr-3">Spend {range}</th>
                <th className="pb-2 text-right pr-3">Spend PY</th>
                <th className="pb-2 text-right pr-3">Fill</th>
                <th className="pb-2 text-right pr-3">OTD</th>
                <th className="pb-2 text-right pr-3">Open POs</th>
                <th className="pb-2 text-right pr-3">Rebate</th>
                <th className="pb-2 text-right">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                    No vendor activity for this period.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr key={v.supplierKey} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                    <td className="py-2">
                      <Link
                        href={`/scorecard/vendor/${encodeURIComponent(v.supplierKey)}?range=${range}&branch=${branch}`}
                        className="flex items-center gap-1 hover:text-cyan-400 transition"
                      >
                        <span className="text-white font-medium">{v.supplierName}</span>
                        <span className="text-slate-500 text-xs ml-1">{v.supplierCode}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 ml-auto" />
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">{v.primaryProductGroup}</div>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-white pr-3">{fmt$(v.spendYTD)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-500 pr-3">{fmt$(v.spendPY)}</td>
                    <td className={`py-2 text-right font-mono tabular-nums pr-3 ${
                      v.fillRatePct !== null && v.fillRatePct < 90 ? 'text-amber-400' : 'text-slate-300'
                    }`}>{fmtPct(v.fillRatePct)}</td>
                    <td className={`py-2 text-right font-mono tabular-nums pr-3 ${
                      v.otdPct !== null && v.otdPct < 85 ? 'text-amber-400' : 'text-slate-300'
                    }`}>{fmtPct(v.otdPct)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-300 pr-3">
                      {v.openPoCount ? v.openPoCount : '—'}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-emerald-400 pr-3">
                      {v.rebateEarnedYTD > 0 ? fmt$(v.rebateEarnedYTD) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {v.riskFlagCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {v.riskFlagCount}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
