'use client';

import React from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function ChartCard({ title, subtitle, action, children, className = '' }: ChartCardProps) {
  return (
    <section
      className={`bg-slate-800/40 border border-slate-700 rounded-lg p-4 print:break-inside-avoid print:bg-white print:border-slate-300 ${className}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide print:text-slate-900">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 print:text-slate-600">{subtitle}</p>}
        </div>
        {action && <div className="print:hidden">{action}</div>}
      </div>
      {children}
    </section>
  );
}
