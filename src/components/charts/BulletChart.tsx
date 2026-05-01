'use client';

import React from 'react';

export interface BulletChartProps {
  label: string;
  value: number | null;
  target: number;
  prior?: number | null;
  max?: number;
  suffix?: string;
  goodWhen?: 'high' | 'low';
}

export default function BulletChart({
  label,
  value,
  target,
  prior = null,
  max,
  suffix = '',
  goodWhen = 'high',
}: BulletChartProps) {
  const ceiling = max ?? Math.max(value ?? 0, target, prior ?? 0) * 1.35;
  const safe = ceiling > 0 ? ceiling : 1;

  const valuePct = value !== null ? Math.min(100, (value / safe) * 100) : 0;
  const targetPct = Math.min(100, (target / safe) * 100);
  const priorPct = prior !== null ? Math.min(100, (prior / safe) * 100) : null;

  const isGood = value !== null
    ? (goodWhen === 'high' ? value >= target : value <= target)
    : null;

  const barColor = isGood === null ? '#4a8fbf' : isGood ? '#1f8a4f' : '#d05050';

  const fmt = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)}${suffix}`;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold mono" style={{ color: 'var(--text)' }}>
            {value !== null ? fmt(value) : '—'}
          </span>
          <span className="text-[10px] mono" style={{ color: 'var(--text-3)' }}>
            tgt {fmt(target)}
          </span>
        </div>
      </div>
      <div className="relative w-full rounded overflow-hidden" style={{ height: 8, background: 'var(--panel-3)' }}>
        {/* Value bar */}
        {value !== null && (
          <div
            className="absolute inset-y-0 left-0 rounded"
            style={{ width: `${valuePct}%`, background: barColor, transition: 'width 400ms ease' }}
          />
        )}
        {/* Target tick */}
        <div
          className="absolute inset-y-0 w-0.5"
          style={{ left: `${targetPct}%`, background: 'var(--gold-bright)' }}
        />
        {/* Prior year tick */}
        {priorPct !== null && (
          <div
            className="absolute inset-y-0 w-px"
            style={{ left: `${priorPct}%`, background: 'var(--text-3)' }}
          />
        )}
      </div>
    </div>
  );
}
