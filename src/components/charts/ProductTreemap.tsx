'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import {
  CHART_COLORS,
  TOOLTIP_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_ITEM_STYLE,
  fmtCurrencyCompact,
} from './theme';

export interface ProductTreemapProps {
  rows: Array<{ label: string; value: number; sub?: string | number }>;
  format?: (n: number) => string;
  height?: number;
  /** Optional secondary metric to show in tooltip (e.g. GM%) */
  formatSub?: (n: number | string) => string;
}

interface TreemapNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: { label?: string; value?: number };
  name?: string;
}

function TreemapNode(props: TreemapNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, name } = props;
  const fill = CHART_COLORS.categorical[index % CHART_COLORS.categorical.length];
  const showLabel = width > 60 && height > 28;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke={CHART_COLORS.tooltipBg}
        strokeWidth={2}
      />
      {showLabel && (
        <text
          x={x + 8}
          y={y + 18}
          fill={CHART_COLORS.tooltipBg}
          fontSize={11}
          fontWeight={600}
          style={{ pointerEvents: 'none' }}
        >
          {name && name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + '…' : name}
        </text>
      )}
    </g>
  );
}

export default function ProductTreemap({
  rows,
  format = fmtCurrencyCompact,
  height = 320,
  formatSub,
}: ProductTreemapProps) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r) => ({
          name: r.label,
          size: r.value,
          sub: r.sub,
        })),
    [rows],
  );

  const total = data.reduce((acc, r) => acc + r.size, 0);

  if (data.length === 0) {
    return <p className="text-xs text-slate-500 py-4">No data</p>;
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <Treemap
          data={data}
          dataKey="size"
          nameKey="name"
          aspectRatio={4 / 3}
          stroke={CHART_COLORS.tooltipBg}
          content={<TreemapNode />}
        >
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(value: number, _name, entry) => {
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
              const sub = (entry.payload as { sub?: string | number }).sub;
              if (sub !== undefined && formatSub) {
                return [`${format(value)} (${pct}%) · ${formatSub(sub)}`, entry.payload.name];
              }
              return [`${format(value)} (${pct}%)`, entry.payload.name];
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
