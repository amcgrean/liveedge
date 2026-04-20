'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MapPin, MapPinOff, RefreshCw, Search, ChevronLeft, ChevronRight,
  Clock, CheckCircle2, XCircle, Zap, Calendar,
} from 'lucide-react';
import type { JobRecord } from '../../api/admin/jobs/route';
import { cn } from '../../../src/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type GpsFilter  = 'all' | 'matched' | 'unmatched';
type SortOption = 'newest' | 'oldest' | 'expect_date';

interface QuickFilter {
  id: string;
  label: string;
  icon: React.ReactNode;
  gps: GpsFilter;
  sort: SortOption;
  status: string;
  description: string;
}

const QUICK_FILTERS: QuickFilter[] = [
  {
    id: 'recent',
    label: 'Recently Created',
    icon: <Clock className="w-3.5 h-3.5" />,
    gps: 'all',
    sort: 'newest',
    status: '',
    description: 'Newest jobs by order date, all GPS statuses',
  },
  {
    id: 'recent_gps',
    label: 'Recently Matched GPS',
    icon: <Zap className="w-3.5 h-3.5" />,
    gps: 'matched',
    sort: 'newest',
    status: '',
    description: 'Newest jobs (by order date) that have GPS coordinates',
  },
  {
    id: 'no_gps',
    label: 'Missing GPS',
    icon: <MapPinOff className="w-3.5 h-3.5" />,
    gps: 'unmatched',
    sort: 'newest',
    status: '',
    description: 'Jobs without GPS coordinates on file',
  },
  {
    id: 'has_gps',
    label: 'Has GPS Match',
    icon: <MapPin className="w-3.5 h-3.5" />,
    gps: 'matched',
    sort: 'newest',
    status: '',
    description: 'All jobs with GPS coordinates',
  },
];

const BRANCH_LABELS: Record<string, string> = {
  '10FD': 'Fort Dodge',
  '20GR': 'Grimes',
  '25BW': 'Birchwood',
  '40CV': 'Coralville',
};

const STATUS_LABELS: Record<string, string> = {
  O: 'Open',
  H: 'Hold',
  C: 'Closed',
  X: 'Cancelled',
  Q: 'Quote',
};

function statusBadge(status: string | null) {
  const s = (status ?? '').toUpperCase();
  const label = STATUS_LABELS[s] ?? (s || '—');
  const cls =
    s === 'O' ? 'bg-emerald-500/15 text-emerald-400'
    : s === 'C' ? 'bg-slate-500/20 text-slate-400'
    : s === 'X' ? 'bg-red-500/15 text-red-400'
    : s === 'H' ? 'bg-amber-500/15 text-amber-400'
    : s === 'Q' ? 'bg-violet-500/15 text-violet-400'
    : 'bg-slate-500/15 text-slate-400';
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium', cls)}>{label}</span>;
}

function gpsBadge(matched: boolean) {
  return matched ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/15 text-cyan-400">
      <CheckCircle2 className="w-3 h-3" /> GPS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-400">
      <XCircle className="w-3 h-3" /> No GPS
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobsClient() {
  const router = useRouter();
  const [jobs, setJobs]               = useState<JobRecord[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [customer, setCustomer]       = useState('');
  const [gps, setGps]                 = useState<GpsFilter>('all');
  const [branch, setBranch]           = useState('');
  const [status, setStatus]           = useState('');
  const [sort, setSort]               = useState<SortOption>('newest');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [activeQuick, setActiveQuick] = useState<string>('recent');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 50));

  // "Recently Created" view uses order_date columns and date-range filter
  const isRecentView = activeQuick === 'recent';

  const fetchJobs = useCallback(async (opts?: {
    page?: number; search?: string; customer?: string;
    gps?: GpsFilter; branch?: string; status?: string; sort?: SortOption;
    dateFrom?: string; dateTo?: string;
  }) => {
    setLoading(true);
    const p        = opts?.page     ?? page;
    const q        = opts?.search   ?? search;
    const cust     = opts?.customer ?? customer;
    const gpsVal   = opts?.gps      ?? gps;
    const br       = opts?.branch   ?? branch;
    const st       = opts?.status   ?? status;
    const sortVal  = opts?.sort     ?? sort;
    const df       = opts?.dateFrom ?? dateFrom;
    const dt       = opts?.dateTo   ?? dateTo;

    const params = new URLSearchParams({
      page: String(p), search: q, customer: cust,
      gps: gpsVal, branch: br, status: st, sort: sortVal,
      date_from: df, date_to: dt,
    });
    try {
      const res = await fetch(`/api/admin/jobs?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setJobs(data.jobs ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error('[JobsClient]', e);
    } finally {
      setLoading(false);
    }
  }, [page, search, customer, gps, branch, status, sort, dateFrom, dateTo]);

  // Initial load
  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    setActiveQuick('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchJobs({ search: val, page: 1 });
    }, 350);
  };

  const handleCustomer = (val: string) => {
    setCustomer(val);
    setPage(1);
    setActiveQuick('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchJobs({ customer: val, page: 1 });
    }, 350);
  };

  const applyFilter = (f: QuickFilter) => {
    setActiveQuick(f.id);
    setGps(f.gps);
    setSort(f.sort);
    setStatus(f.status);
    setPage(1);
    // Keep existing date range when switching to recent view; clear for others
    const df = f.id === 'recent' ? dateFrom : '';
    const dt = f.id === 'recent' ? dateTo   : '';
    if (f.id !== 'recent') { setDateFrom(''); setDateTo(''); }
    fetchJobs({ gps: f.gps, sort: f.sort, status: f.status, page: 1, dateFrom: df, dateTo: dt });
  };

  const handleDateFrom = (val: string) => {
    setDateFrom(val);
    setPage(1);
    fetchJobs({ dateFrom: val, page: 1 });
  };

  const handleDateTo = (val: string) => {
    setDateTo(val);
    setPage(1);
    fetchJobs({ dateTo: val, page: 1 });
  };

  const handleBranch = (val: string) => {
    setBranch(val);
    setPage(1);
    setActiveQuick('');
    fetchJobs({ branch: val, page: 1 });
  };

  const handleStatus = (val: string) => {
    setStatus(val);
    setPage(1);
    setActiveQuick('');
    fetchJobs({ status: val, page: 1 });
  };

  const handleSort = (val: SortOption) => {
    setSort(val);
    setPage(1);
    setActiveQuick('');
    fetchJobs({ sort: val, page: 1 });
  };

  const goPage = (p: number) => {
    setPage(p);
    fetchJobs({ page: p });
  };

  // Column count for empty state colspan
  const colCount = isRecentView ? 6 : 8;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Job Review</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${total.toLocaleString()} jobs`}
          </p>
        </div>
        <button
          onClick={() => fetchJobs()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            title={f.description}
            onClick={() => applyFilter(f)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition',
              activeQuick === f.id
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            )}
          >
            {f.icon}
            {f.label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search customer, reference…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </div>
        <input
          type="text"
          placeholder="Customer code…"
          value={customer}
          onChange={(e) => handleCustomer(e.target.value)}
          className="w-36 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
        <select
          value={branch}
          onChange={(e) => handleBranch(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
        >
          <option value="">All Branches</option>
          {Object.entries(BRANCH_LABELS).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>

        {/* Status + GPS + Sort — hidden on recent view since those cols are removed */}
        {!isRecentView && (
          <>
            <select
              value={status}
              onChange={(e) => handleStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
            <select
              value={gps}
              onChange={(e) => { setGps(e.target.value as GpsFilter); setActiveQuick(''); fetchJobs({ gps: e.target.value as GpsFilter, page: 1 }); setPage(1); }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All GPS</option>
              <option value="matched">GPS Matched</option>
              <option value="unmatched">No GPS</option>
            </select>
            <select
              value={sort}
              onChange={(e) => handleSort(e.target.value as SortOption)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="expect_date">By Expect Date</option>
            </select>
          </>
        )}

        {/* Date range filter — only on Recently Created view */}
        {isRecentView && (
          <>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleDateFrom(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                title="Created from"
              />
            </div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              title="Created to"
            />
          </>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              {isRecentView ? (
                // Recently Created columns — no SO#, Reference, Expect Date, Status
                <>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Branch</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Address</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Created By</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span className="flex items-center gap-1">
                      Created Date
                    </span>
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">GPS</th>
                </>
              ) : (
                // Default columns
                <>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">SO #</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Branch</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Customer</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Address</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Reference</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Expect Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">GPS</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="text-center py-12 text-slate-500">Loading…</td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center py-12 text-slate-500">No jobs found</td>
              </tr>
            ) : isRecentView ? (
              // ── Recently Created rows ──────────────────────────────────────
              jobs.map((job) => (
                <tr
                  key={job.so_id}
                  onClick={() => router.push(`/admin/jobs/${job.so_id}`)}
                  className="hover:bg-slate-800/50 transition cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="text-white text-sm font-medium leading-tight truncate max-w-[200px]">
                      {job.cust_name ?? '—'}
                    </div>
                    {job.cust_code && (
                      <div className="text-slate-500 text-[11px] font-mono">{job.cust_code}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {BRANCH_LABELS[job.system_id] ?? job.system_id}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden md:table-cell">
                    <span className="truncate block max-w-[200px]">
                      {[job.address_1, job.city].filter(Boolean).join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm">
                    {job.salesperson ?? <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-sm font-mono">
                    {job.order_date ?? <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">{gpsBadge(job.gps_matched)}</td>
                </tr>
              ))
            ) : (
              // ── Default rows ──────────────────────────────────────────────
              jobs.map((job) => (
                <tr
                  key={job.so_id}
                  className="hover:bg-slate-800/50 transition group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/jobs/${job.so_id}`}
                      className="font-mono text-cyan-400 hover:text-cyan-300 transition text-sm font-medium"
                    >
                      {job.so_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {BRANCH_LABELS[job.system_id] ?? job.system_id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white text-sm font-medium leading-tight truncate max-w-[180px]">
                      {job.cust_name ?? '—'}
                    </div>
                    {job.cust_code && (
                      <div className="text-slate-500 text-[11px] font-mono">{job.cust_code}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden md:table-cell">
                    <span className="truncate block max-w-[200px]">
                      {[job.address_1, job.city].filter(Boolean).join(', ') || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden lg:table-cell font-mono text-xs">
                    {job.reference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden lg:table-cell">
                    {job.expect_date ?? '—'}
                  </td>
                  <td className="px-4 py-3">{statusBadge(job.so_status)}</td>
                  <td className="px-4 py-3">{gpsBadge(job.gps_matched)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 50 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
