'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  CHART_COLORS,
  fmtNumber,
} from './theme';

export interface MixDonutRow {
  label: string;
  value: number;
  prevValue?: number;
}

export interface MixDonutProps {
  rows: MixDonutRow[];
  topN?: number;
  centerLabel?: string;
  format?: (n: number) => string;
  height?: number;
}

function rollUp(rows: MixDonutRow[], topN: number): MixDonutRow[] {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otherValue = rest.reduce((acc, r) => acc + r.value, 0);
  const otherPrev = rest.reduce((acc, r) => acc + (r.prevValue ?? 0), 0);
  return [
    ...top,
    {
      label: 'Other',
      value: otherValue,
      prevValue: otherPrev > 0 ? otherPrev : undefined,
    },
  ];
}

export default function MixDonut({
  rows,
  topN = 6,
  centerLabel = 'Total',
  format = fmtNumber,
  height = 260,
}: MixDonutProps) {
  const data = useMemo(() => rollUp(rows, topN), [rows, topN]);
  const total = data.reduce((acc, r) => acc + r.value, 0);

  return (
    <div style={{ width: '100%', height, position: 'relative' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={1}
            stroke={CHART_COLORS.tooltipBg}
            strokeWidth={1}
          >
            {data.map((d, i) => (
              <Cell key={d.label} fill={CHART_COLORS.categorical[i % CHART_COLORS.categorical.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: number, name: string, entry) => {
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              const prev = (entry.payload as MixDonutRow).prevValue;
              if (prev !== undefined && prev > 0) {
                const delta = ((value - prev) / prev) * 100;
                const sign = delta >= 0 ? '+' : '';
                return [`${format(value)} (${pct}%, ${sign}${delta.toFixed(1)}% YoY)`, name];
              }
              return [`${format(value)} (${pct}%)`, name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.textMuted }}
            iconSize={10}
            layout="vertical"
            verticalAlign="middle"
            align="right"
          />
        </PieChart>
      </ResponsiveContainer>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        style={{ paddingRight: '30%' }}
      >
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{centerLabel}</p>
        <p className="text-xl font-bold text-white tabular-nums">{format(total)}</p>
      </div>
    </div>
  );
}
