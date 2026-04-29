'use client';

import React, { useMemo } from 'react';
import { CHART_COLORS, STATUS_LABELS, STATUS_PIPELINE_ORDER } from './theme';

export interface StatusFunnelBarProps {
  counts: Record<string, number>;
  height?: number;
  format?: (n: number) => string;
}

export default function StatusFunnelBar({
  counts,
  height = 40,
  format = (n: number) => n.toLocaleString(),
}: StatusFunnelBarProps) {
  const segments = useMemo(() => {
    const seen = new Set<string>();
    const ordered = STATUS_PIPELINE_ORDER
      .filter((k) => counts[k] && counts[k] > 0)
      .map((k) => {
        seen.add(k);
        return { key: k, count: counts[k] };
      });
    // Append any unknown statuses at the end (so we never silently drop data)
    for (const k of Object.keys(counts)) {
      if (!seen.has(k) && counts[k] > 0) {
        ordered.push({ key: k, count: counts[k] });
      }
    }
    return ordered;
  }, [counts]);

  const total = segments.reduce((acc, s) => acc + s.count, 0);

  if (total === 0) {
    return <p className="text-xs text-slate-500">No status data</p>;
  }

  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-md print:border print:border-slate-300"
        style={{ height }}
      >
        {segments.map((s) => {
          const pct = (s.count / total) * 100;
          const color = CHART_COLORS.status[s.key] ?? CHART_COLORS.compare;
          return (
            <div
              key={s.key}
              className="flex items-center justify-center text-xs font-semibold text-slate-900 transition hover:opacity-90"
              style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 1 ? 24 : 0 }}
              title={`${STATUS_LABELS[s.key] ?? s.key}: ${format(s.count)} (${pct.toFixed(1)}%)`}
            >
              {pct >= 6 ? format(s.count) : ''}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {segments.map((s) => {
          const color = CHART_COLORS.status[s.key] ?? CHART_COLORS.compare;
          const pct = (s.count / total) * 100;
          return (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-slate-300 print:text-slate-700">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium">{STATUS_LABELS[s.key] ?? s.key}</span>
              <span className="tabular-nums text-slate-500">
                {format(s.count)} ({pct.toFixed(0)}%)
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
