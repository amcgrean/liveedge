'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import {
  FolderOpen,
  Search,
  RefreshCw,
  Plus,
  Calendar,
  User,
  Building2,
  ChevronRight,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  Archive,
  Send,
  Filter,
} from 'lucide-react';
import { formatDateTime, STATUS_LABELS } from '../../src/lib/utils';

interface BidRow {
  id: string;
  bidNumber: string | null;
  jobName: string;
  customerName: string | null;
  estimatorName: string;
  branch: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All Bids' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'archived', label: 'Archived' },
];

interface Props { session: Session; }

export default function BidsListClient({ session }: Props) {
  const [bids, setBids] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const userRole = (session.user as { role?: string }).role ?? 'estimator';

  const fetchBids = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/bids?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBids(data.bids ?? []);
      }
    } catch {
      // DB might not be configured yet
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  useEffect(() => {
    const t = setTimeout(fetchBids, 350);
    return () => clearTimeout(t);
  }, [search, fetchBids]);

  const updateStatus = async (bid: BidRow, newStatus: string) => {
    setUpdatingId(bid.id);
    try {
      await fetch(`/api/bids/${bid.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchBids();
    } finally {
      setUpdatingId(null);
    }
  };

  const statusActions = (bid: BidRow): { label: string; icon: React.ReactNode; status: string }[] => {
    const actions = [];
    if (bid.status === 'draft') actions.push({ label: 'Mark Submitted', icon: <Send className="w-3.5 h-3.5" />, status: 'submitted' });
    if (bid.status === 'submitted') {
      actions.push({ label: 'Won', icon: <CheckCircle className="w-3.5 h-3.5" />, status: 'won' });
      actions.push({ label: 'Lost', icon: <XCircle className="w-3.5 h-3.5" />, status: 'lost' });
    }
    if (!['archived'].includes(bid.status)) {
      actions.push({ label: 'Archive', icon: <Archive className="w-3.5 h-3.5" />, status: 'archived' });
    }
    return actions;
  };

  return (
    <div>
      <TopNav userName={session.user?.name} userRole={userRole} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Bids</h1>
            <p className="text-slate-400 text-sm mt-0.5">All saved estimates</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchBids}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition text-sm"
            >
              <Plus className="w-4 h-4" /> New Bid
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search bids..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400 mr-1" />
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === f.value
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="admin-card">
          {loading && bids.length === 0 ? (
            <div className="p-16 text-center text-slate-400 animate-pulse">Loading bids...</div>
          ) : bids.length === 0 ? (
            <div className="p-16 text-center">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-sm mb-2">No bids found.</p>
              <Link href="/" className="text-cyan-400 text-sm hover:underline">Start a new bid →</Link>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Bid #</th>
                  <th>Job Name</th>
                  <th>Customer</th>
                  <th>Estimator</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bids.map((bid) => {
                  const statusInfo = STATUS_LABELS[bid.status] ?? STATUS_LABELS.draft;
                  const actions = statusActions(bid);
                  return (
                    <tr key={bid.id}>
                      <td className="font-mono text-xs text-slate-400">{bid.bidNumber ?? '—'}</td>
                      <td>
                        <Link
                          href={`/?bid=${bid.id}`}
                          className="font-semibold text-white hover:text-cyan-400 transition"
                        >
                          {bid.jobName}
                        </Link>
                        {bid.version > 1 && (
                          <span className="ml-2 text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">
                            v{bid.version}
                          </span>
                        )}
                      </td>
                      <td className="text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          {bid.customerName ?? '—'}
                        </span>
                      </td>
                      <td className="text-slate-300">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          {bid.estimatorName}
                        </span>
                      </td>
                      <td className="capitalize text-slate-400 text-sm">
                        {bid.branch.replace('_', ' ')}
                      </td>
                      <td>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="text-slate-400 text-xs">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(bid.updatedAt)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {actions.map((action) => (
                            <button
                              key={action.status}
                              onClick={() => updateStatus(bid, action.status)}
                              disabled={updatingId === bid.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition"
                              title={action.label}
                            >
                              {action.icon}
                              <span className="hidden lg:inline">{action.label}</span>
                            </button>
                          ))}
                          <Link
                            href={`/?bid=${bid.id}`}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                            title="Open bid"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          {bids.length} bid{bids.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
