'use client';

import React, { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Printer } from 'lucide-react';
import type { ScorecardPeriod } from '@/lib/scorecard/types';

const BRANCHES = [
  { id: '10FD', label: 'Fort Dodge' },
  { id: '20GR', label: 'Grimes' },
  { id: '25BW', label: 'Birchwood' },
  { id: '40CV', label: 'Coralville' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

interface CustomerSuggestion {
  customerId: string;
  customerName: string;
}

interface Props {
  customerId: string;
  baseYear: number;
  compareYear: number;
  period: ScorecardPeriod;
  cutoffDate: string;
  branchIds: string[];
}

export default function FilterBar({
  customerId,
  baseYear,
  compareYear,
  period,
  cutoffDate,
  branchIds,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [customerSearch, setCustomerSearch] = useState('');
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function buildUrl(overrides: Partial<{
    customerId: string;
    baseYear: number;
    compareYear: number;
    period: ScorecardPeriod;
    cutoffDate: string;
    branchIds: string[];
  }>) {
    const sp = new URLSearchParams();
    sp.set('baseYear', String(overrides.baseYear ?? baseYear));
    sp.set('compareYear', String(overrides.compareYear ?? compareYear));
    sp.set('period', overrides.period ?? period);
    sp.set('cutoffDate', overrides.cutoffDate ?? cutoffDate);
    (overrides.branchIds ?? branchIds).forEach((b) => sp.append('branch', b));
    const cid = encodeURIComponent(overrides.customerId ?? customerId);
    return `/scorecard/${cid}?${sp.toString()}`;
  }

  function push(overrides: Parameters<typeof buildUrl>[0]) {
    startTransition(() => router.push(buildUrl(overrides)));
  }

  function handleCustomerSearch(val: string) {
    setCustomerSearch(val);
    clearTimeout(debounceRef.current);
    if (val.length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/scorecard/customers?q=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json() as { customers: CustomerSuggestion[] };
        setSuggestions(data.customers);
        setShowSuggestions(true);
      }
    }, 200);
  }

  function selectCustomer(cid: string) {
    setCustomerSearch('');
    setSuggestions([]);
    setShowSuggestions(false);
    push({ customerId: cid });
  }

  function toggleBranch(id: string) {
    const next = branchIds.includes(id)
      ? branchIds.filter((b) => b !== id)
      : [...branchIds, id];
    push({ branchIds: next });
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-3 print:hidden">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Customer typeahead */}
        <div ref={searchRef} className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Switch customer…"
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s.customerId}
                  onMouseDown={() => selectCustomer(s.customerId)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition flex items-center justify-between"
                >
                  <span className="text-white">{s.customerName}</span>
                  <span className="text-slate-400 text-xs">{s.customerId}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Year pickers */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Base Year</label>
          <select
            value={baseYear}
            onChange={(e) => push({ baseYear: parseInt(e.target.value, 10) })}
            className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Compare Year</label>
          <select
            value={compareYear}
            onChange={(e) => push({ compareYear: parseInt(e.target.value, 10) })}
            className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Period toggle */}
        <div>
          <label className="block text-xs text-slate-400 mb-1">Period</label>
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            {(['YTD', 'Full Year'] as ScorecardPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => push({ period: p })}
                className={`px-3 py-2 text-sm font-medium transition ${
                  period === p
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Cutoff date (YTD only) */}
        {period === 'YTD' && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">YTD Cutoff</label>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => push({ cutoffDate: e.target.value })}
              className="bg-slate-900 border border-slate-600 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}

        {/* Print button */}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Branch chips */}
      <div className="flex gap-2 flex-wrap">
        {BRANCHES.map((b) => (
          <button
            key={b.id}
            onClick={() => toggleBranch(b.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              branchIds.includes(b.id)
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {b.label}
          </button>
        ))}
        {branchIds.length > 0 && (
          <button
            onClick={() => push({ branchIds: [] })}
            className="px-3 py-1 rounded-full text-xs text-slate-400 hover:text-white transition"
          >
            All Branches
          </button>
        )}
      </div>
    </div>
  );
}
