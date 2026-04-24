'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Search, RefreshCw, ExternalLink, X, ChevronDown, ChevronUp } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface HistoryOrder {
  so_number: string;
  system_id: string;
  so_status: string;
  sale_type: string | null;
  salesperson: string | null;
  invoice_date: string | null;
  reference: string | null;
  customer_name: string | null;
  customer_code: string | null;
  line_count: number;
}

interface Order {
  so_number: string;
  system_id: string;
  customer_name: string | null;
  customer_code: string | null;
  reference: string | null;
  so_status: string;
  sale_type: string | null;
  rep_1: string | null;
  po_number: string | null;
  expect_date: string | null;
  line_count: number;
}

const STATUS_OPTIONS = [
  { value: '',  label: 'All Statuses' },
  { value: 'O', label: 'Open' },
  { value: 'K', label: 'Picking' },
  { value: 'P', label: 'Partial' },
  { value: 'S', label: 'Staged' },
  { value: 'D', label: 'Delivered' },
  { value: 'I', label: 'Invoiced' },
  { value: 'C', label: 'Closed' },
];

const SALE_TYPE_OPTIONS = [
  { value: '',   label: 'All Types' },
  { value: 'SO', label: 'Sales Order' },
  { value: 'Willcall', label: 'Will Call' },
  { value: 'T',  label: 'Transfer' },
  { value: 'Q',  label: 'Quote' },
];

const STATUS_COLORS: Record<string, string> = {
  O: 'bg-blue-500/20 text-blue-300 border-blue-800',
  K: 'bg-yellow-500/20 text-yellow-300 border-yellow-800',
  P: 'bg-orange-500/20 text-orange-300 border-orange-800',
  S: 'bg-purple-500/20 text-purple-300 border-purple-800',
  D: 'bg-cyan-500/20 text-cyan-300 border-cyan-800',
  I: 'bg-green-500/20 text-green-300 border-green-800',
  C: 'bg-slate-500/20 text-slate-400 border-slate-700',
};

const BRANCH_OPTIONS = ['', '10FD', '20GR', '25BW', '40CV'];

interface Props {
  isAdmin: boolean;
  userBranch: string | null;
  agentId: string | null;
}

function formatDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export default function TransactionsClient({ isAdmin, userBranch, agentId }: Props) {
  usePageTracking();
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();

  const [tab, setTab] = useState<'orders' | 'history'>(() =>
    sp.get('tab') === 'history' ? 'history' : 'orders'
  );

  // ── History tab state ──────────────────────────────────────────────────────
  const [hq,         setHq]         = useState('');
  const [hCustNum,   setHCustNum]   = useState('');
  const [hBranch,    setHBranch]    = useState(isAdmin ? '' : (userBranch ?? ''));
  const [hDateFrom,  setHDateFrom]  = useState('');
  const [hDateTo,    setHDateTo]    = useState('');
  const [hOrders,    setHOrders]    = useState<HistoryOrder[]>([]);
  const [hLoading,   setHLoading]   = useState(false);
  const [hPage,      setHPage]      = useState(1);
  const [hHasMore,   setHHasMore]   = useState(false);
  const [hSearched,  setHSearched]  = useState(false);

  const fetchHistory = useCallback(async (pg = 1) => {
    setHLoading(true);
    setHSearched(true);
    try {
      const p = new URLSearchParams({ limit: '50', page: String(pg) });
      if (hq)       p.set('q',               hq);
      if (hCustNum) p.set('customer_number', hCustNum);
      if (hBranch)  p.set('branch',          hBranch);
      if (hDateFrom) p.set('date_from',      hDateFrom);
      if (hDateTo)   p.set('date_to',        hDateTo);
      const res = await fetch(`/api/sales/history?${p}`);
      if (!res.ok) return;
      const data = await res.json();
      const rows: HistoryOrder[] = data.history ?? [];
      setHOrders(pg === 1 ? rows : (prev: HistoryOrder[]) => [...prev, ...rows]);
      setHHasMore(rows.length === 50);
      setHPage(pg);
    } finally { setHLoading(false); }
  }, [hq, hCustNum, hBranch, hDateFrom, hDateTo]);

  // Initialize filter state from URL params (or sensible defaults)
  const [q,         setQ]         = useState(() => sp.get('q') ?? '');
  const [status,    setStatus]    = useState(() => sp.get('status') ?? '');
  const [branch,    setBranch]    = useState(() => sp.get('branch') ?? (isAdmin ? '' : (userBranch ?? '')));
  const [saleType,  setSaleType]  = useState(() => sp.get('sale_type') ?? '');
  const [dateFrom,  setDateFrom]  = useState(() => sp.get('date_from') ?? '');
  const [dateTo,    setDateTo]    = useState(() => sp.get('date_to') ?? '');
  const [rep1,      setRep1]      = useState(() => sp.get('rep1') ?? '');
  const [rep3,      setRep3]      = useState(() => sp.get('rep3') ?? '');
  const [showMore,  setShowMore]  = useState(false);

  const [orders,   setOrders]   = useState<Order[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(false);

  // Push current filter state to URL without triggering navigation
  const syncUrl = useCallback((filters: {
    q: string; status: string; branch: string; saleType: string;
    dateFrom: string; dateTo: string; rep1: string; rep3: string;
  }) => {
    const params = new URLSearchParams();
    if (filters.q)        params.set('q',         filters.q);
    if (filters.status)   params.set('status',    filters.status);
    if (filters.branch)   params.set('branch',    filters.branch);
    if (filters.saleType) params.set('sale_type', filters.saleType);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo)   params.set('date_to',   filters.dateTo);
    if (filters.rep1)     params.set('rep1',      filters.rep1);
    if (filters.rep3)     params.set('rep3',      filters.rep3);
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false });
  }, [router, pathname]);

  const fetchOrders = useCallback(async (filters: {
    q: string; status: string; branch: string; saleType: string;
    dateFrom: string; dateTo: string; rep1: string; rep3: string; page: number;
  }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q)        params.set('q',         filters.q);
      params.set('status', filters.status);
      if (filters.branch)   params.set('branch',    filters.branch);
      if (filters.saleType) params.set('sale_type', filters.saleType);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo)   params.set('date_to',   filters.dateTo);
      if (filters.rep1)     params.set('rep1',      filters.rep1);
      if (filters.rep3)     params.set('rep3',      filters.rep3);
      params.set('limit', '50');
      params.set('page', String(filters.page));

      const res = await fetch(`/api/sales/orders?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const newOrders: Order[] = data.orders ?? [];
      setOrders((prev: Order[]) => filters.page === 1 ? newOrders : [...prev, ...newOrders]);
      setHasMore(newOrders.length === 50);
    } finally {
      setLoading(false);
    }
  }, []);

  // Combined: update filter state + sync URL + fetch
  const applyFilters = useCallback((overrides: Partial<{
    q: string; status: string; branch: string; saleType: string;
    dateFrom: string; dateTo: string; rep1: string; rep3: string;
  }> = {}) => {
    const filters = {
      q, status, branch, saleType, dateFrom, dateTo, rep1, rep3,
      ...overrides,
    };
    setPage(1);
    syncUrl(filters);
    fetchOrders({ ...filters, page: 1 });
  }, [q, status, branch, saleType, dateFrom, dateTo, rep1, rep3, syncUrl, fetchOrders]);

  // Initial load from URL params on mount
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    fetchOrders({ q, status, branch, saleType, dateFrom, dateTo, rep1, rep3, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleQChange = (v: string) => {
    setQ(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters({ q: v }), 400);
  };

  const clearFilter = (key: 'rep1' | 'rep3' | 'saleType' | 'status' | 'dateFrom' | 'dateTo') => {
    const map = { rep1: setRep1, rep3: setRep3, saleType: setSaleType,
                  status: setStatus, dateFrom: setDateFrom, dateTo: setDateTo };
    map[key]('');
    applyFilters({ [key]: '' });
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchOrders({ q, status, branch, saleType, dateFrom, dateTo, rep1, rep3, page: next });
  };

  // Active filter chips (non-default values the user can clear)
  type Chip = { label: string; onClear: () => void };
  const chips: Chip[] = [
    ...(rep1 ? [{ label: `Rep: ${rep1.toLowerCase()}`, onClear: () => clearFilter('rep1') }] : []),
    ...(rep3 ? [{ label: `Wrote by: ${rep3.toLowerCase()}`, onClear: () => clearFilter('rep3') }] : []),
    ...(saleType ? [{ label: `Type: ${saleType.toUpperCase()}`, onClear: () => clearFilter('saleType') }] : []),
    ...(status ? [{ label: `Status: ${STATUS_OPTIONS.find(s => s.value === status)?.label ?? status}`, onClear: () => clearFilter('status') }] : []),
    ...(dateFrom ? [{ label: `From: ${dateFrom}`, onClear: () => clearFilter('dateFrom') }] : []),
    ...(dateTo   ? [{ label: `To: ${dateTo}`,     onClear: () => clearFilter('dateTo') }] : []),
  ];

  // Quick shortcuts for "my" views (only shown when agentId known)
  const shortcuts = agentId ? [
    { label: 'My Open',         params: { rep1: agentId, status: 'O', saleType: '', rep3: '' } },
    { label: 'My Will Calls',   params: { rep1: agentId, status: '', saleType: 'Willcall', rep3: '' } },
    { label: 'I Wrote',         params: { rep3: agentId, status: 'O', saleType: '', rep1: '' } },
    { label: 'WC I Wrote',      params: { rep3: agentId, status: '', saleType: 'Willcall', rep1: '' } },
  ] : [];

  const switchTab = (t: 'orders' | 'history') => {
    setTab(t);
    router.replace(pathname + (t === 'history' ? '?tab=history' : ''), { scroll: false });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/sales" className="text-sm text-cyan-400 hover:underline">&larr; Sales Hub</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Transactions</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {(['orders', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  tab === t ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'orders' ? 'Sales Orders' : 'Purchase History'}
              </button>
            ))}
          </div>
          {tab === 'orders' && (
            <button
              onClick={() => applyFilters()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-sm transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {tab === 'orders' && (<>
      {/* Quick shortcuts */}
      {shortcuts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {shortcuts.map(s => {
            const isActive = s.params.rep1 === rep1 && s.params.rep3 === rep3
              && s.params.saleType === saleType && s.params.status === status;
            return (
              <button
                key={s.label}
                onClick={() => {
                  setRep1(s.params.rep1 ?? rep1);
                  setRep3(s.params.rep3 ?? rep3);
                  setSaleType(s.params.saleType);
                  setStatus(s.params.status);
                  applyFilters(s.params);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            );
          })}
          <button
            onClick={() => {
              setRep1(''); setRep3(''); setSaleType(''); setStatus('');
              applyFilters({ rep1: '', rep3: '', saleType: '', status: '' });
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-500 hover:text-white transition"
          >
            All orders
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 space-y-3">
          {/* Row 1: search + status + branch */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => handleQChange(e.target.value)}
                placeholder="SO#, customer, reference, PO#…"
                className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); applyFilters({ status: e.target.value }); }}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={saleType}
              onChange={(e) => { setSaleType(e.target.value); applyFilters({ saleType: e.target.value }); }}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            >
              {SALE_TYPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {isAdmin && (
              <div className="flex gap-1">
                {BRANCH_OPTIONS.map(b => (
                  <button
                    key={b}
                    onClick={() => { setBranch(b); applyFilters({ branch: b }); }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                      branch === b
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {b || 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: rep + date (expandable) */}
          <button
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition"
          >
            {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showMore ? 'Fewer filters' : 'More filters (rep, date)'}
          </button>

          {showMore && (
            <div className="flex flex-wrap gap-3 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-20">Account rep</label>
                <input
                  value={rep1}
                  onChange={(e) => { setRep1(e.target.value); applyFilters({ rep1: e.target.value }); }}
                  placeholder="e.g. garretp"
                  className="w-32 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-20">Written by</label>
                <input
                  value={rep3}
                  onChange={(e) => { setRep3(e.target.value); applyFilters({ rep3: e.target.value }); }}
                  placeholder="e.g. garretp"
                  className="w-32 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">From</label>
                <input type="date" value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); applyFilters({ dateFrom: e.target.value }); }}
                  className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">To</label>
                <input type="date" value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); applyFilters({ dateTo: e.target.value }); }}
                  className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {chips.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {chips.map(chip => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-900/50 border border-cyan-700 text-cyan-300 text-xs"
              >
                {chip.label}
                <button onClick={chip.onClear} className="hover:text-white transition ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setRep1(''); setRep3(''); setSaleType(''); setDateFrom(''); setDateTo('');
                applyFilters({ rep1: '', rep3: '', saleType: '', dateFrom: '', dateTo: '' });
              }}
              className="text-xs text-slate-600 hover:text-slate-400 transition underline"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading orders…
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2 text-sm">
            <p>No orders match the current filters.</p>
            {chips.length > 0 && (
              <button
                onClick={() => {
                  setRep1(''); setRep3(''); setSaleType(''); setDateFrom(''); setDateTo('');
                  applyFilters({ rep1: '', rep3: '', saleType: '', dateFrom: '', dateTo: '' });
                }}
                className="text-cyan-500 hover:underline text-xs"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">SO #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Expect</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rep</th>
                    {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Branch</th>}
                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lines</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={`${o.so_number}-${o.system_id}`}
                        className="border-b border-white/5 hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-cyan-400 font-medium">
                        <Link href={`/sales/orders/${encodeURIComponent(o.so_number)}`}
                              className="hover:text-cyan-300 hover:underline transition-colors">
                          {o.so_number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 max-w-[180px]">
                        {o.customer_code ? (
                          <Link href={`/sales/customers/${encodeURIComponent(o.customer_code.trim())}`}
                                className="text-white hover:text-cyan-400 transition flex items-center gap-1 truncate">
                            <span className="truncate">{o.customer_name ?? o.customer_code}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-40" />
                          </Link>
                        ) : (
                          <span className="text-slate-300 truncate block">{o.customer_name ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[140px] truncate">{o.reference ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${STATUS_COLORS[o.so_status?.toUpperCase()] ?? 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {o.so_status?.toUpperCase() ?? '?'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{o.sale_type || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">{formatDate(o.expect_date)}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        {o.rep_1 ? (
                          <button
                            onClick={() => { setRep1(o.rep_1!); setShowMore(true); applyFilters({ rep1: o.rep_1! }); }}
                            className="hover:text-cyan-400 transition"
                            title={`Filter by rep: ${o.rep_1}`}
                          >
                            {o.rep_1.toLowerCase()}
                          </button>
                        ) : '—'}
                      </td>
                      {isAdmin && <td className="px-4 py-2.5 text-slate-500 text-xs">{o.system_id}</td>}
                      <td className="px-4 py-2.5 text-slate-400 text-xs">{o.line_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="px-4 py-3 border-t border-white/10 text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      </>)}

      {tab === 'history' && (
        <div className="space-y-4">
          {/* History filters */}
          <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={hq}
                  onChange={(e) => setHq(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchHistory(1)}
                  placeholder="SO#, customer, reference…"
                  className="w-full bg-slate-800 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <input
                value={hCustNum}
                onChange={(e) => setHCustNum(e.target.value)}
                placeholder="Customer # (exact)"
                className="w-44 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              {isAdmin && (
                <div className="flex gap-1">
                  {BRANCH_OPTIONS.map(b => (
                    <button key={b}
                      onClick={() => setHBranch(b)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${hBranch === b ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >{b || 'All'}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-xs text-slate-400">Invoice date</label>
              <input type="date" value={hDateFrom} onChange={(e) => setHDateFrom(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
              <span className="text-xs text-slate-500">to</span>
              <input type="date" value={hDateTo} onChange={(e) => setHDateTo(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500" />
              <button onClick={() => fetchHistory(1)} disabled={hLoading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                {hLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>

          {/* History results */}
          <div className="bg-slate-900 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm text-slate-400">
                {!hSearched ? 'Enter criteria above to search purchase history' : `${hOrders.length} records`}
              </span>
              {hLoading && <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />}
            </div>
            {!hSearched ? (
              <div className="px-4 py-12 text-center text-slate-500 text-sm">
                Search invoiced and closed orders above
              </div>
            ) : hOrders.length === 0 && !hLoading ? (
              <div className="px-4 py-12 text-center text-slate-500 text-sm">No history found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">SO #</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice Date</th>
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                      {isAdmin && <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Branch</th>}
                      <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Lines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hOrders.map((o) => (
                      <tr key={`${o.so_number}-${o.system_id}`} className="border-b border-white/5 hover:bg-slate-800/50">
                        <td className="px-4 py-2.5 font-mono text-cyan-400 font-medium">
                          <Link href={`/sales/orders/${encodeURIComponent(o.so_number)}`} className="hover:underline">{o.so_number}</Link>
                        </td>
                        <td className="px-4 py-2.5">
                          {o.customer_code ? (
                            <Link href={`/sales/customers/${encodeURIComponent(o.customer_code.trim())}`}
                              className="text-white hover:text-cyan-400 transition flex items-center gap-1">
                              <span className="truncate max-w-[160px] block">{o.customer_name ?? o.customer_code}</span>
                              <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                            </Link>
                          ) : <span className="text-slate-300">{o.customer_name ?? '—'}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[140px] truncate">{o.reference ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${
                            o.so_status?.toUpperCase() === 'I'
                              ? 'bg-green-500/20 text-green-300 border-green-800'
                              : 'bg-slate-700 text-slate-400 border-slate-600'
                          }`}>{o.so_status?.toUpperCase() ?? '?'}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-300 text-xs whitespace-nowrap">{formatDate(o.invoice_date)}</td>
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{o.sale_type ?? '—'}</td>
                        {isAdmin && <td className="px-4 py-2.5 text-slate-500 text-xs">{o.system_id}</td>}
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{o.line_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hHasMore && (
              <div className="px-4 py-3 border-t border-white/10 text-center">
                <button onClick={() => fetchHistory(hPage + 1)} disabled={hLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition disabled:opacity-50">
                  {hLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
