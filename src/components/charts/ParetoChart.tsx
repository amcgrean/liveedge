'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  AXIS_PROPS,
  GRID_PROPS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  CHART_COLORS,
  fmtCurrencyCompact,
  fmtPct1FromPct,
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
    const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((acc, r) => acc + r.value, 0);
    let running = 0;
    return sorted.map((r) => {
      running += r.value;
      return {
        label: r.label,
        value: r.value,
        cumulative: total > 0 ? (running / total) * 100 : 0,
      };
    });
  }, [rows]);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis
            dataKey="label"
            {...AXIS_PROPS}
            angle={-25}
            textAnchor="end"
            height={48}
            interval={0}
            tick={{ ...AXIS_PROPS.tick, fontSize: 10 }}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={format}
            {...AXIS_PROPS}
            width={56}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(n: number) => `${n}%`}
            {...AXIS_PROPS}
            width={40}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            formatter={(value: number, _name, entry) => {
              if (entry.dataKey === 'cumulative') return fmtPct1FromPct(value);
              return format(value);
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 6 }}
            iconSize={10}
          />
          <Bar
            yAxisId="left"
            dataKey="value"
            name={valueLabel}
            fill={CHART_COLORS.base}
            radius={[3, 3, 0, 0]}
            maxBarSize={48}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cumulative"
            name="Cumulative %"
            stroke={CHART_COLORS.accent}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS.accent, r: 3 }}
            activeDot={{ r: 5 }}
          />
          <ReferenceLine
            yAxisId="right"
            y={80}
            stroke={CHART_COLORS.warn}
            strokeDasharray="4 4"
            label={{
              value: '80%',
              position: 'right',
              fill: CHART_COLORS.warn,
              fontSize: 10,
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
