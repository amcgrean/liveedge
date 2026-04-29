interface Props {
  label: string;
  base: number | null;
  compare: number | null;
  format?: 'currency' | 'percent';
  higherIsBetter?: boolean;
  avg?: number | null;
}

function fmt(n: number | null, format: 'currency' | 'percent'): string {
  if (n === null || n === undefined) return '—';
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }
  return `${(n * 100).toFixed(2)}%`;
}

function fmtDelta(delta: number | null, format: 'currency' | 'percent'): string {
  if (delta === null) return '—';
  const abs = Math.abs(delta);
  const formatted =
    format === 'currency'
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(abs)
      : `${(abs * 100).toFixed(2)}pp`;
  return delta >= 0 ? `+${formatted}` : `−${formatted}`;
}

export default function KpiTile({
  label,
  base,
  compare,
  format = 'currency',
  higherIsBetter = true,
  avg,
}: Props) {
  const delta = base !== null && compare !== null ? base - compare : null;
  const sign = delta === null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const isGood =
    sign === 'flat' ? null : higherIsBetter ? sign === 'up' : sign === 'down';

  const arrow = sign === 'up' ? '▲' : sign === 'down' ? '▼' : '—';
  const deltaColor =
    isGood === true
      ? 'text-emerald-400'
      : isGood === false
        ? 'text-red-400'
        : 'text-slate-500';

  const avgDelta = avg !== null && avg !== undefined && base !== null ? base - avg : null;
  const avgGood = avgDelta === null ? null : higherIsBetter ? avgDelta >= 0 : avgDelta <= 0;
  const avgDeltaColor = avgGood === true ? 'text-emerald-400' : avgGood === false ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-2xl font-bold text-white tabular-nums">{fmt(base, format)}</p>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-sm text-slate-400 tabular-nums">{fmt(compare, format)}</p>
        <span className={`text-sm font-semibold tabular-nums flex items-center gap-0.5 ${deltaColor}`}>
          <span className="text-xs">{arrow}</span>
          {fmtDelta(delta, format)}
        </span>
      </div>
      {avg !== null && avg !== undefined && (
        <div className="flex items-center justify-between gap-2 pt-1.5 mt-0.5 border-t border-slate-700/60">
          <p className="text-xs text-slate-500">Avg {fmt(avg, format)}</p>
          {avgDelta !== null && (
            <span className={`text-xs font-medium tabular-nums ${avgDeltaColor}`}>
              {avgDelta >= 0 ? '+' : '−'}{Math.abs(avgDelta * 100).toFixed(2)}pp
            </span>
          )}
        </div>
      )}
    </div>
  );
}
