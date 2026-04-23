'use client';

import React, { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, BarChart2, ChevronRight } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { CustomerListRow } from '@/lib/scorecard/types';

const BRANCHES = [
  { id: '10FD', label: 'Fort Dodge' },
  { id: '20GR', label: 'Grimes' },
  { id: '25BW', label: 'Birchwood' },
  { id: '40CV', label: 'Coralville' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function fmt$(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function deltaColor(base: number, compare: number): string {
  if (base > compare) return 'text-emerald-400';
  if (base < compare) return 'text-red-400';
  return 'text-slate-400';
}

interface Props {
  customers: CustomerListRow[];
  baseYear: number;
  compareYear: number;
  search: string;
  branchIds: string[];
}

export default function ScorecardListClient({
  customers,
  baseYear,
  compareYear,
  search: initialSearch,
  branchIds: initialBranches,
}: Props) {
  usePageTracking();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(initialSearch);
  const [activeBranches, setActiveBranches] = useState<string[]>(initialBranches);
  const [activeBaseYear, setActiveBaseYear] = useState(baseYear);
  const [activeCompareYear, setActiveCompareYear] = useState(compareYear);

  const pushUrl = useCallback(
    (overrides: Partial<{ q: string; branch: string[]; baseYear: number; compareYear: number }>) => {
      const sp = new URLSearchParams();
      const q = overrides.q ?? search;
      const branches = overrides.branch ?? activeBranches;
      const by = overrides.baseYear ?? activeBaseYear;
      const cy = overrides.compareYear ?? activeCompareYear;
      if (q) sp.set('q', q);
      branches.forEach((b) => sp.append('branch', b));
      sp.set('baseYear', String(by));
      sp.set('compareYear', String(cy));
      startTransition(() => router.push(`/scorecard?${sp.toString()}`));
    },
    [search, activeBranches, activeBaseYear, activeCompareYear, router],
  );

  function handleSearch(val: string) {
    setSearch(val);
    pushUrl({ q: val });
  }

  function toggleBranch(id: string) {
    const next = activeBranches.includes(id)
      ? activeBranches.filter((b) => b !== id)
      : [...activeBranches, id];
    setActiveBranches(next);
    pushUrl({ branch: next });
  }

  function buildScorecardUrl(customerId: string) {
    const sp = new URLSearchParams();
    sp.set('baseYear', String(activeBaseYear));
    sp.set('compareYear', String(activeCompareYear));
    activeBranches.forEach((b) => sp.append('branch', b));
    return `/scorecard/${encodeURIComponent(customerId)}?${sp.toString()}`;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-cyan-400" />
            Customer Scorecard
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Year-over-year performance by customer
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer name or ID…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          {/* Year pickers */}
          <div className="flex items-center gap-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Base Year</label>
              <select
                value={activeBaseYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setActiveBaseYear(y);
                  pushUrl({ baseYear: y });
                }}
                className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Compare Year</label>
              <select
                value={activeCompareYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  setActiveCompareYear(y);
                  pushUrl({ compareYear: y });
                }}
                className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Branch chips */}
        <div className="flex gap-2 flex-wrap">
          {BRANCHES.map((b) => (
            <button
              key={b.id}
              onClick={() => toggleBranch(b.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                activeBranches.includes(b.id)
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {b.label}
            </button>
          ))}
          {activeBranches.length > 0 && (
            <button
              onClick={() => { setActiveBranches([]); pushUrl({ branch: [] }); }}
              className="px-3 py-1 rounded-full text-xs text-slate-400 hover:text-white transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-left">
              <th className="pb-2 text-slate-400 font-medium">Customer</th>
              <th className="pb-2 text-slate-400 font-medium text-right pr-4">
                {activeBaseYear} Sales
              </th>
              <th className="pb-2 text-slate-400 font-medium text-right pr-4">
                {activeCompareYear} Sales
              </th>
              <th className="pb-2 text-slate-400 font-medium text-right pr-4">
                {activeBaseYear} GP
              </th>
              <th className="pb-2 text-slate-400 font-medium text-right">GP%</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500">
                  No customers found
                </td>
              </tr>
            )}
            {customers.map((c) => {
              const gpPct = c.salesBase > 0 ? (c.gpBase / c.salesBase) * 100 : null;
              return (
                <tr
                  key={c.customerId}
                  className="border-b border-slate-800 hover:bg-slate-800/40 transition group"
                >
                  <td className="py-2.5 pr-4">
                    <Link
                      href={buildScorecardUrl(c.customerId)}
                      className="flex items-center gap-1 group-hover:text-cyan-400 transition"
                    >
                      <span className="font-medium text-white">{c.customerName}</span>
                      <span className="text-slate-500 text-xs ml-1">{c.customerId}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 ml-auto" />
                    </Link>
                  </td>
                  <td className={`py-2.5 pr-4 text-right font-mono tabular-nums ${deltaColor(c.salesBase, c.salesCompare)}`}>
                    {fmt$(c.salesBase)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-400">
                    {fmt$(c.salesCompare)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-300">
                    {fmt$(c.gpBase)}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                    {gpPct !== null ? `${gpPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {customers.length > 0 && (
        <p className="text-xs text-slate-500 text-right">{customers.length} customers shown</p>
      )}
    </div>
  );
}
