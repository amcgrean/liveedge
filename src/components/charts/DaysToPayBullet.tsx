'use client';

import React from 'react';
import { CHART_COLORS } from './theme';

export interface DaysToPayBulletProps {
  /** Customer's current value (lower is better). */
  value: number | null;
  /** Prior-period customer value for context. */
  compareValue?: number | null;
  /** Customer-list average — drawn as a dashed reference line. */
  average?: number | null;
  /** Hard ceiling for the axis (e.g. 90 days). Defaults to max(value, average) * 1.4. */
  max?: number;
  /** Threshold above which the customer is "over" (turns the bar red). Defaults to average. */
  threshold?: number | null;
  height?: number;
}

function fmtDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${n.toFixed(0)}d`;
}

export default function DaysToPayBullet({
  value,
  compareValue = null,
  average = null,
  max,
  threshold,
  height = 28,
}: DaysToPayBulletProps) {
  if (value === null) {
    return <p className="text-xs text-slate-500 py-2">No payment data on file</p>;
  }

  const effectiveThreshold = threshold ?? average;
  const isOver = effectiveThreshold !== null && effectiveThreshold !== undefined && value > effectiveThreshold;
  const computedCeiling = Math.max(value, average ?? 0, compareValue ?? 0) * 1.4;
  const ceiling = max ?? (computedCeiling > 0 ? computedCeiling : 60);

  const valuePct = Math.min(100, (value / ceiling) * 100);
  const avgPct = average !== null && average !== undefined ? Math.min(100, (average / ceiling) * 100) : null;
  const comparePct =
    compareValue !== null && compareValue !== undefined ? Math.min(100, (compareValue / ceiling) * 100) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-white tabular-nums">{fmtDays(value)}</span>
          {compareValue !== null && (
            <span className="text-xs text-slate-500 tabular-nums">vs {fmtDays(compareValue)} prior yr</span>
          )}
        </div>
        {average !== null && (
          <span className="text-xs text-slate-500 tabular-nums">
            avg {fmtDays(average)}
          </span>
        )}
      </div>
      <div
        className="relative w-full bg-slate-700/40 rounded overflow-hidden print:bg-slate-200 print:border print:border-slate-300"
        style={{ height }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded transition-all"
          style={{
            width: `${valuePct}%`,
            backgroundColor: isOver ? CHART_COLORS.negative : CHART_COLORS.positive,
          }}
          title={`${fmtDays(value)} (${valuePct.toFixed(0)}% of ${ceiling.toFixed(0)}d ceiling)`}
        />
        {comparePct !== null && (
          <div
            className="absolute inset-y-0 w-px bg-slate-400 print:bg-slate-700"
            style={{ left: `${comparePct}%` }}
            title={`Prior yr: ${fmtDays(compareValue)}`}
          />
        )}
        {avgPct !== null && (
          <div
            className="absolute inset-y-0"
            style={{
              left: `${avgPct}%`,
              borderLeft: `2px dashed ${CHART_COLORS.accent}`,
            }}
            title={`Customer-list avg: ${fmtDays(average)}`}
          />
        )}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-slate-500 tabular-nums">
        <span>0</span>
        <span>{ceiling.toFixed(0)}d</span>
      </div>
      {isOver && (
        <p className="mt-1 text-xs text-red-400">
          Above {effectiveThreshold !== null && effectiveThreshold !== undefined ? `${effectiveThreshold.toFixed(0)}d` : 'threshold'}
        </p>
      )}
    </div>
  );
}
