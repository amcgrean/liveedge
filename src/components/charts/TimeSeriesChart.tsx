'use client';

import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Brush,
} from 'recharts';
import {
  AXIS_PROPS,
  GRID_PROPS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  CHART_COLORS,
  fmtNumber,
} from './theme';

export type TimeSeriesPoint = { date: string } & Record<string, number | string>;

export interface TimeSeriesChartProps {
  data: TimeSeriesPoint[];
  series: { key: string; label: string; color: string }[];
  referenceY?: { value: number; label: string };
  brush?: boolean;
  height?: number;
  yFormat?: (n: number) => string;
  stacked?: boolean;
}

const fmtShortDate = (iso: string): string => {
  // YYYY-MM-DD → "Apr 15"
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function TimeSeriesChart({
  data,
  series,
  referenceY,
  brush = false,
  height = 220,
  yFormat = fmtNumber,
  stacked = false,
}: TimeSeriesChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtShortDate}
            {...AXIS_PROPS}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={yFormat} {...AXIS_PROPS} width={48} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            labelFormatter={fmtShortDate}
            formatter={(v: number) => yFormat(v)}
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted, paddingTop: 6 }}
              iconSize={10}
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? 'stack' : undefined}
              radius={stacked ? 0 : [2, 2, 0, 0]}
              maxBarSize={32}
            />
          ))}
          {referenceY && (
            <ReferenceLine
              y={referenceY.value}
              stroke={CHART_COLORS.accent}
              strokeDasharray="4 4"
              label={{
                value: referenceY.label,
                position: 'right',
                fill: CHART_COLORS.accent,
                fontSize: 10,
              }}
            />
          )}
          {brush && (
            <Brush
              dataKey="date"
              height={20}
              stroke={CHART_COLORS.axis}
              fill={CHART_COLORS.tooltipBg}
              tickFormatter={fmtShortDate}
              travellerWidth={8}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
