'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  AXIS_PROPS,
  GRID_PROPS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  CHART_COLORS,
  fmtCurrencyCompact,
} from './theme';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface ComparisonBarChartProps {
  rows: Array<{ id: string; label: string; base: number; compare: number }>;
  baseLabel: string;
  compareLabel: string;
  format?: (n: number) => string;
  showDelta?: boolean;
  height?: number;
}

function pctDelta(base: number, compare: number): number | null {
  if (!compare) return null;
  return ((base - compare) / compare) * 100;
}

export default function ComparisonBarChart({
  rows,
  baseLabel,
  compareLabel,
  format = fmtCurrencyCompact,
  showDelta = true,
  height,
}: ComparisonBarChartProps) {
  const computedHeight = height ?? Math.max(140, rows.length * 56 + 60);
  const data = rows.map((r) => ({
    id: r.id,
    label: r.label,
    [baseLabel]: r.base,
    [compareLabel]: r.compare,
  }));

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: showDelta ? '1fr 80px' : '1fr' }}>
      <div style={{ width: '100%', height: computedHeight }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} horizontal={false} />
            <XAxis type="number" tickFormatter={format} {...AXIS_PROPS} />
            <YAxis
              dataKey="label"
              type="category"
              {...AXIS_PROPS}
              width={92}
              tick={{ ...AXIS_PROPS.tick, fontSize: 12 }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
              formatter={(v: number) => format(v)}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 6 }}
              iconSize={10}
            />
            <Bar dataKey={baseLabel} fill={CHART_COLORS.base} radius={[0, 3, 3, 0]} maxBarSize={18} />
            <Bar dataKey={compareLabel} fill={CHART_COLORS.compare} radius={[0, 3, 3, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {showDelta && (
        <div className="flex flex-col justify-around pt-8 pb-2 print:hidden">
          {rows.map((r) => {
            const pct = pctDelta(r.base, r.compare);
            if (pct === null) {
              return (
                <span key={r.id} className="text-xs text-slate-600 text-right">
                  —
                </span>
              );
            }
            const flat = Math.abs(pct) < 0.1;
            const up = pct > 0;
            return (
              <span
                key={r.id}
                className={`inline-flex items-center justify-end gap-0.5 text-xs font-semibold tabular-nums ${
                  flat ? 'text-slate-500' : up ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {flat ? (
                  <Minus className="w-3 h-3" />
                ) : up ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {Math.abs(pct).toFixed(1)}%
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
