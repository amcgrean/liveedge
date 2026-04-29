'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle, AlertCircle, Clock, XCircle, Search, RefreshCw } from 'lucide-react';
import { cn } from '../../../src/lib/utils';

type EmailRow = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  emailType: string | null;
  matchStatus: string;
  confirmedSoId: string | null;
  confirmedCustName: string | null;
  matchConfidence: string | null;
  extractedPoNumber: string | null;
  extractedWoNumber: string | null;
  extractedAmount: string | null;
  extractedAddress: string | null;
  extractedCity: string | null;
  extractedState: string | null;
  extractedZip: string | null;
  extractedDescription: string | null;
  receivedAt: string;
};

type StatusCounts = Record<string, number>;

const STATUS_TABS = [
  { key: '',           label: 'All'       },
  { key: 'pending',    label: 'Pending'   },
  { key: 'matched',    label: 'Matched'   },
  { key: 'confirmed',  label: 'Confirmed' },
  { key: 'unmatched',  label: 'No Match'  },
  { key: 'rejected',   label: 'Rejected'  },
];

function statusIcon(status: string) {
  switch (status) {
    case 'confirmed': return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    case 'matched':   return <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />;
    case 'pending':   return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    case 'unmatched': return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'rejected':  return <XCircle className="w-3.5 h-3.5 text-slate-500" />;
    default:          return <Mail className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function statusBadge(status: string) {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  switch (status) {
    case 'confirmed': return cn(base, 'bg-green-500/15 text-green-300');
    case 'matched':   return cn(base, 'bg-cyan-500/15 text-cyan-300');
    case 'pending':   return cn(base, 'bg-amber-500/15 text-amber-300');
    case 'unmatched': return cn(base, 'bg-red-500/15 text-red-300');
    case 'rejected':  return cn(base, 'bg-slate-700 text-slate-400');
    default:          return cn(base, 'bg-slate-700 text-slate-300');
  }
}

function typeBadge(type: string | null) {
  if (!type || type === 'other') return null;
  const base = 'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase';
  return type === 'po'
    ? <span className={cn(base, 'bg-blue-500/20 text-blue-300')}>PO</span>
    : <span className={cn(base, 'bg-purple-500/20 text-purple-300')}>WO</span>;
}

function formatAmount(v: string | null): string {
  if (!v) return '—';
  const n = parseFloat(v);
  return isNaN(n) ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function HubbellClient() {
  const [emails, setEmails]           = useState<EmailRow[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({});
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [status, setStatus]           = useState('');
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');

  const fetchEmails = useCallback(async (p = page, s = status, q = search) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), status: s, search: q });
      const res = await fetch(`/api/admin/hubbell/emails?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEmails(data.emails);
      setTotal(data.total);
      setStatusCounts(data.statusCounts ?? {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  function handleStatusTab(s: string) {
    setStatus(s);
    setPage(1);
    fetchEmails(1, s, search);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
    fetchEmails(1, status, searchInput);
  }

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Hubbell Email Inbox</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Inbound PO &amp; WO emails forwarded to hubbell@beisser.cloud — matched to sales orders by job site address.
          </p>
        </div>
        <button
          onClick={() => fetchEmails()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap border-b border-white/10 pb-0">
        {STATUS_TABS.map(({ key, label }) => {
          const count = key === '' ? total : (statusCounts[key] ?? 0);
          return (
            <button
              key={key}
              onClick={() => handleStatusTab(key)}
              className={cn(
                'px-3 py-2 text-sm font-medium transition border-b-2 -mb-px',
                status === key
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-300">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by subject, sender, PO/WO #, SO…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-slate-900/60">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject / From</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">PO / WO #</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Address</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Match</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-800 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : emails.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  No emails found.
                </td>
              </tr>
            ) : (
              emails.map((email) => (
                <tr key={email.id} className="hover:bg-white/5 transition">
                  {/* Type badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {typeBadge(email.emailType) ?? <span className="text-slate-600 text-xs">—</span>}
                  </td>

                  {/* Subject + from */}
                  <td className="px-4 py-3 max-w-xs">
                    <Link href={`/admin/hubbell/${email.id}`} className="text-white hover:text-cyan-400 font-medium line-clamp-1 block transition">
                      {email.subject}
                    </Link>
                    <span className="text-xs text-slate-500 truncate block">
                      {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                    </span>
                  </td>

                  {/* PO/WO number */}
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-300">
                    {email.extractedPoNumber && <div>PO: {email.extractedPoNumber}</div>}
                    {email.extractedWoNumber && <div>WO: {email.extractedWoNumber}</div>}
                    {!email.extractedPoNumber && !email.extractedWoNumber && <span className="text-slate-600">—</span>}
                  </td>

                  {/* Address */}
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px]">
                    {email.extractedAddress
                      ? <span className="line-clamp-2">{email.extractedAddress}, {email.extractedCity}, {email.extractedState} {email.extractedZip}</span>
                      : <span className="text-slate-600">—</span>
                    }
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-sm text-slate-200">
                    {formatAmount(email.extractedAmount)}
                  </td>

                  {/* Match status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className={statusBadge(email.matchStatus)}>
                      {statusIcon(email.matchStatus)}
                      {email.matchStatus === 'confirmed' ? 'Confirmed'
                        : email.matchStatus === 'matched' ? 'Auto-matched'
                        : email.matchStatus === 'pending' ? 'Pending'
                        : email.matchStatus === 'unmatched' ? 'Unmatched'
                        : email.matchStatus === 'rejected' ? 'Rejected'
                        : email.matchStatus}
                    </div>
                    {email.confirmedSoId && (
                      <Link
                        href={`/admin/hubbell/jobs/${email.confirmedSoId}`}
                        className="text-xs text-cyan-500 hover:text-cyan-300 mt-0.5 block transition truncate max-w-[160px]"
                        title={`Job #${email.confirmedSoId}`}
                      >
                        {email.confirmedCustName ?? `Job #${email.confirmedSoId}`}
                      </Link>
                    )}
                    {email.matchConfidence && !email.confirmedSoId && (
                      <span className="text-xs text-slate-500 mt-0.5 block">
                        {Math.round(parseFloat(email.matchConfidence))}% match
                      </span>
                    )}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                    {formatDate(email.receivedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{total} email{total !== 1 ? 's' : ''}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); fetchEmails(p); }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <span className="px-3 py-1.5">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => { const p = page + 1; setPage(p); fetchEmails(p); }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
