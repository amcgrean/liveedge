'use client';

import React from 'react';
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

export interface ComboBarLineChartProps {
  data: Array<{ label: string; bar: number; line: number }>;
  barLabel: string;
  lineLabel: string;
  barFormat?: (n: number) => string;
  lineFormat?: (n: number) => string;
  height?: number;
}

export default function ComboBarLineChart({
  data,
  barLabel,
  lineLabel,
  barFormat = fmtCurrencyCompact,
  lineFormat = fmtPct1FromPct,
  height = 240,
}: ComboBarLineChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis
            yAxisId="left"
            tickFormatter={barFormat}
            {...AXIS_PROPS}
            width={56}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={lineFormat}
            {...AXIS_PROPS}
            width={48}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            formatter={(value: number, _name, entry) => {
              if (entry.dataKey === 'line') return lineFormat(value);
              return barFormat(value);
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 6 }}
            iconSize={10}
          />
          <Bar
            yAxisId="left"
            dataKey="bar"
            name={barLabel}
            fill={CHART_COLORS.base}
            radius={[3, 3, 0, 0]}
            maxBarSize={64}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="line"
            name={lineLabel}
            stroke={CHART_COLORS.accent}
            strokeWidth={2}
            dot={{ fill: CHART_COLORS.accent, r: 4 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
