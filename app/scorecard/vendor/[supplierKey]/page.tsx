import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, Package, Truck } from 'lucide-react';
import {
  fetchVendorDetail,
  fetchVendorThreeYear,
  fetchVendorTopItems,
  computeDerivedRiskFlags,
} from '../../../../src/lib/vendor-scorecard/queries';
import type {
  VendorScorecardParams,
  VendorYearEntry,
} from '../../../../src/lib/vendor-scorecard/types';
import ScorecardTabs from '../../_components/ScorecardTabs';
import ScorecardBreadcrumb from '@/components/scorecard/ScorecardBreadcrumb';
import Breadcrumb from '@/components/Breadcrumb';
import {
  ChartCard,
  ComboBarLineChart,
  ParetoChart,
  ProductTreemap,
  fmtCurrencyCompact,
} from '@/components/charts';

export const maxDuration = 60;

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const RANGES: VendorScorecardParams['range'][] = ['MTD', 'QTD', 'YTD', 'TTM', 'FY'];

function fmt$(n: number): string {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n.toFixed(1)}%`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-slate-800/40 border border-slate-700 rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function KpiTile({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`bg-slate-800/40 border rounded-lg p-3 ${alert ? 'border-amber-700/60' : 'border-slate-700'}`}>
      <div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${alert ? 'text-amber-400' : 'text-white'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default async function VendorScorecardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierKey: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { supplierKey: rawKey } = await params;
  const supplierKey = decodeURIComponent(rawKey);
  const sp = await searchParams;

  const range = (RANGES.includes(String(sp.range ?? 'YTD') as VendorScorecardParams['range'])
    ? String(sp.range ?? 'YTD')
    : 'YTD') as VendorScorecardParams['range'];
  const branch = String(sp.branch ?? 'all');
  const baseYear = parseInt(String(sp.baseYear ?? new Date().getFullYear()), 10);
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;

  const vsParams: VendorScorecardParams = { range, branch, productGroup: 'all' };

  const [detailRes, threeYearRes, topItemsRes] = await Promise.allSettled([
    fetchVendorDetail(supplierKey, vsParams),
    fetchVendorThreeYear(supplierKey, branch, baseYear),
    fetchVendorTopItems(supplierKey, vsParams, 25),
  ]);

  const failures: string[] = [];
  const logFail = (name: string, r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected') {
      failures.push(name);
      console.error(`[scorecard/vendor/${supplierKey}] ${name}:`, r.reason);
    }
  };
  logFail('detail', detailRes);
  logFail('three-year', threeYearRes);
  logFail('top items', topItemsRes);

  const detail = detailRes.status === 'fulfilled' ? detailRes.value : null;
  if (!detail) notFound();

  const threeYear = threeYearRes.status === 'fulfilled' ? threeYearRes.value : [];
  const topItems = topItemsRes.status === 'fulfilled' ? topItemsRes.value : [];

  const yoyPct = detail.spendPY > 0 ? ((detail.spendYTD - detail.spendPY) / detail.spendPY) * 100 : null;

  const fromHint = `vendor:${supplierKey}`;

  // Pacing for missed-rebate detection: where we are in the year as a fraction.
  const now = new Date();
  const startYear = new Date(now.getFullYear(), 0, 1);
  const endYear = new Date(now.getFullYear() + 1, 0, 1);
  const ytdPacing = (now.getTime() - startYear.getTime()) / (endYear.getTime() - startYear.getTime());

  const flags = computeDerivedRiskFlags({
    fillRatePct: detail.fillRatePct,
    otdPct: detail.otdPct,
    openPoCount: detail.openPoCount,
    lastReceiveDate: detail.lastReceiveDate,
    rebatePrograms: detail.rebatePrograms,
    ytdPacing,
  });

  // Total flag count blends stored + derived
  const totalFlagCount = flags.count + detail.riskFlags.length;

  return (
    <>
      <Breadcrumb
        items={[
          { href: '/scorecard/overview', label: 'Scorecards' },
          { href: `/scorecard/vendor?range=${range}&branch=${branch}`, label: 'Vendors' },
          { label: detail.supplierName },
        ]}
      />
      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
        <ScorecardTabs />
        <ScorecardBreadcrumb from={from} fallback="vendor" />

      {failures.length > 0 && (
        <div className="p-3 bg-amber-900/30 border border-amber-700/60 rounded-lg text-amber-200 text-sm print:hidden">
          Some sections failed to load: {failures.join(', ')}. Showing available data.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Truck className="w-6 h-6 text-cyan-400" />
          {detail.supplierName}
          <span className="font-normal text-base ml-2 text-slate-400">Vendor Scorecard</span>
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mt-1 text-slate-400 font-mono">
          <span>{detail.supplierCode}</span>
          <span>·</span>
          <span>{range}</span>
          {branch !== 'all' && (
            <>
              <span>·</span>
              <span>{BRANCH_LABELS[branch] ?? branch}</span>
            </>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Range</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/scorecard/vendor/${encodeURIComponent(supplierKey)}?range=${r}&branch=${branch}`}
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
            {[{ id: 'all', label: 'All' }, ...Object.entries(BRANCH_LABELS).map(([id, label]) => ({ id, label }))].map((b) => (
              <Link
                key={b.id}
                href={`/scorecard/vendor/${encodeURIComponent(supplierKey)}?range=${range}&branch=${b.id}`}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition ${
                  branch === b.id ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
                }`}
              >
                {b.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 3-year chart */}
      {threeYear.length > 0 && <ThreeYearReceiptsChart entries={threeYear} />}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          label={`Spend ${range}`}
          value={fmt$(detail.spendYTD)}
          sub={yoyPct !== null ? `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}% YoY` : 'vs PY —'}
        />
        <KpiTile label="Rebate Earned" value={fmt$(detail.rebateEarnedYTD)} />
        <KpiTile label="Rebate Accrued" value={fmt$(detail.rebateAccrued)} sub="(projected)" />
        <KpiTile label="Fill Rate" value={fmtPct(detail.fillRatePct)} alert={detail.fillRatePct !== null && detail.fillRatePct < 90} />
        <KpiTile label="On-Time %" value={fmtPct(detail.otdPct)} alert={detail.otdPct !== null && detail.otdPct < 85} />
        <KpiTile label="Open POs" value={detail.openPoCount.toString()} sub={fmt$(detail.openPoValue)} />
      </div>

      {/* Risk flags strip */}
      {totalFlagCount > 0 && (
        <Section title={`Active Risks (${totalFlagCount})`}>
          <div className="flex flex-wrap gap-2">
            {flags.lowFillRate && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-900/40 border border-amber-700/60 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Low Fill Rate
              </span>
            )}
            {flags.lateDelivery && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-900/40 border border-amber-700/60 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Late Deliveries
              </span>
            )}
            {flags.missedRebate && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-900/40 border border-red-700/60 text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Missed Rebate Pacing
              </span>
            )}
            {flags.noRecentReceipts && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-900/40 border border-amber-700/60 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" /> No Recent Receipts
              </span>
            )}
            {detail.riskFlags.map((f) => (
              <span
                key={f.id}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  f.severity === 'high'
                    ? 'bg-red-900/40 border-red-700/60 text-red-300'
                    : f.severity === 'medium'
                      ? 'bg-amber-900/40 border-amber-700/60 text-amber-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> {f.flagType}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Branch contribution */}
      {detail.branchBreakdown.length > 0 && (
        <ChartCard title="Spend by Branch" subtitle={`${range} receipt cost grouped by branch`}>
          <ComboBarLineChart
            data={detail.branchBreakdown
              .filter((b) => b.spendYTD > 0)
              .map((b) => ({
                label: BRANCH_LABELS[b.systemId] ?? b.systemId,
                bar: b.spendYTD,
                line: b.otdPct ?? 0,
              }))}
            barLabel={`${range} Spend`}
            lineLabel="OTD %"
            barFormat={fmtCurrencyCompact}
            height={260}
          />
        </ChartCard>
      )}

      {/* Product Mix */}
      {detail.productGroupBreakdown.length > 0 && (
        <ChartCard title="Product Mix" subtitle="Tile size = spend; hover for % of vendor total">
          <ProductTreemap
            rows={detail.productGroupBreakdown
              .filter((g) => g.spendYTD > 0)
              .map((g) => ({ label: g.productGroup, value: g.spendYTD, sub: g.pctOfTotal * 100 }))}
            format={fmtCurrencyCompact}
            formatSub={(n) => `${(typeof n === 'number' ? n : 0).toFixed(1)}%`}
            height={300}
          />
        </ChartCard>
      )}

      {/* Top items */}
      <Section title={`Top Items from ${detail.supplierName}`}>
        {topItems.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No items received in this period.</p>
        ) : (
          <>
            <ChartCard title="" subtitle="">
              <ParetoChart
                rows={topItems.slice(0, 15).map((it) => ({
                  label: it.description || it.itemCode,
                  value: it.spendYTD,
                }))}
                format={fmtCurrencyCompact}
                valueLabel="Spend"
                height={300}
              />
            </ChartCard>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="pb-2">Item</th>
                    <th className="pb-2">Product Group</th>
                    <th className="pb-2 text-right pr-3">Spend</th>
                    <th className="pb-2 text-right pr-3">Qty</th>
                    <th className="pb-2 text-right">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.map((it) => (
                    <tr key={it.itemCode} className="border-b border-slate-800 hover:bg-slate-800/30 transition">
                      <td className="py-1.5">
                        <Link
                          href={`/scorecard/product/item/${encodeURIComponent(it.itemCode)}?from=${encodeURIComponent(fromHint)}`}
                          className="inline-flex items-center gap-1 text-white hover:text-cyan-400 transition"
                        >
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          {it.description || it.itemCode}
                          <span className="text-slate-500 italic text-xs ml-1">{it.itemCode}</span>
                          <ExternalLink className="w-3 h-3 text-slate-600" />
                        </Link>
                      </td>
                      <td className="py-1.5 text-slate-400 text-xs">
                        {it.productMajor ?? '—'}
                        {it.productMinor && <span className="text-slate-600"> › {it.productMinor}</span>}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-white pr-3">{fmt$(it.spendYTD)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-300 pr-3">
                        {it.qtyYTD.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-slate-400">{it.lineCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {/* Rebate programs */}
      {detail.rebatePrograms.length > 0 && (
        <Section title="Rebate Programs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {detail.rebatePrograms.map((p) => {
              const attainPct = p.targetAmount ? (p.attainedAmount / p.targetAmount) * 100 : null;
              const onTrack = attainPct !== null && attainPct >= 90;
              const atRisk = attainPct !== null && attainPct >= 50 && attainPct < 90;
              const missed = attainPct !== null && attainPct < 50;
              return (
                <div key={p.id} className="bg-slate-900/60 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">{p.programName}</div>
                      <div className="text-xs text-slate-500 capitalize">{p.programType.replace('_', ' ')}</div>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        onTrack ? 'bg-emerald-900/40 text-emerald-300' :
                        atRisk ? 'bg-amber-900/40 text-amber-300' :
                        missed ? 'bg-red-900/40 text-red-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {onTrack ? 'On Track' : atRisk ? 'At Risk' : missed ? 'Missed' : '—'}
                    </span>
                  </div>
                  {p.targetAmount && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{fmt$(p.attainedAmount)} attained</span>
                        <span>of {fmt$(p.targetAmount)}</span>
                      </div>
                      <div className="h-2 mt-1 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full ${onTrack ? 'bg-emerald-500' : atRisk ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, attainPct ?? 0)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Earned: </span>
                      <span className="text-white font-mono tabular-nums">{fmt$(p.earnedRebate)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Accrued: </span>
                      <span className="text-white font-mono tabular-nums">{fmt$(p.accruedRebate)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Detail metrics */}
      <Section title="Detail Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Total Receipts</span>
            <span className="font-mono tabular-nums text-white">
              {threeYear.reduce((s, y) => s + y.receiptCount, 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Lines</span>
            <span className="font-mono tabular-nums text-white">
              {threeYear.reduce((s, y) => s + y.lineCount, 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Active Programs</span>
            <span className="font-mono tabular-nums text-white">{detail.rebatePrograms.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Active Risk Flags</span>
            <span className="font-mono tabular-nums text-white">{totalFlagCount}</span>
            {totalFlagCount === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-1" />}
          </div>
        </div>
      </Section>
      </div>
    </>
  );
}

function ThreeYearReceiptsChart({ entries }: { entries: VendorYearEntry[] }) {
  const data = entries.map((e) => ({
    label: e.label,
    bar: e.spend,
    line: e.lineCount,
  }));
  return (
    <ChartCard title="3-Year Receipts & Line Volume" subtitle="Annual spend bars with line count overlay">
      <ComboBarLineChart
        data={data}
        barLabel="Spend"
        lineLabel="Lines"
        barFormat={fmtCurrencyCompact}
        height={240}
      />
    </ChartCard>
  );
}
