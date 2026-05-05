'use client';

import React, { useMemo } from 'react';
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

export interface ParetoChartProps {
  rows: Array<{ label: string; value: number }>;
  format?: (n: number) => string;
  height?: number;
  valueLabel?: string;
}

export default function ParetoChart({
  rows,
  format = fmtCurrencyCompact,
  height = 280,
  valueLabel = 'Sales',
}: ParetoChartProps) {
  const data = useMemo(() => {
    return [...rows]
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((r) => ({ label: r.label, value: r.value }));
  }, [rows]);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis
            dataKey="label"
            {...AXIS_PROPS}
            angle={-35}
            textAnchor="end"
            height={60}
            interval={0}
            tick={{ ...AXIS_PROPS.tick, fontSize: 10 }}
            tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 17) + '…' : v}
          />
          <YAxis
            tickFormatter={format}
            {...AXIS_PROPS}
            width={56}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            formatter={(value: number) => format(value)}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 6 }}
            iconSize={10}
          />
          <Bar
            dataKey="value"
            name={valueLabel}
            fill={CHART_COLORS.base}
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
