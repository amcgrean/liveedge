'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Search,
  FolderOpen,
  Calendar,
  User,
  Building2,
  ChevronRight,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatDateTime, STATUS_LABELS } from '../../lib/utils';
import { JobInputs } from '../../types/estimate';

interface BidListItem {
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

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (inputs: JobInputs, bidId: string, bidNumber: string) => void;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export function OpenBidModal({ open, onClose, onLoad }: Props) {
  const [bids, setBids] = useState<BidListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleting, setDeleting] = useState<string | null>(null);

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
      // Silently fail – DB may not be configured yet
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    if (open) fetchBids();
  }, [open, fetchBids]);

  // Debounce search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(fetchBids, 350);
    return () => clearTimeout(t);
  }, [search, open, fetchBids]);

  const handleLoad = async (bid: BidListItem) => {
    try {
      const res = await fetch(`/api/bids/${bid.id}`);
      if (!res.ok) return;
      const data = await res.json();
      onLoad(data.bid.inputs as JobInputs, bid.id, bid.bidNumber ?? bid.id);
      onClose();
    } catch {
      alert('Failed to load bid. Please try again.');
    }
  };

  const handleDelete = async (e: React.MouseEvent, bid: BidListItem) => {
    e.stopPropagation();
    if (!confirm(`Delete bid "${bid.bidNumber ?? bid.jobName}"? This cannot be undone.`)) return;
    setDeleting(bid.id);
    try {
      await fetch(`/api/bids/${bid.id}`, { method: 'DELETE' });
      setBids((prev) => prev.filter((b) => b.id !== bid.id));
    } catch {
      alert('Failed to delete bid.');
    } finally {
      setDeleting(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Open Bid</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBids}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-white/10 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by job name, customer, estimator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === f.value
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bid list */}
        <div className="flex-1 overflow-y-auto">
          {loading && bids.length === 0 ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">
              Loading bids...
            </div>
          ) : bids.length === 0 ? (
            <div className="p-12 text-center">
              <FolderOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">
                {search || statusFilter !== 'all'
                  ? 'No bids match your search.'
                  : 'No saved bids yet. Save a bid to see it here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {bids.map((bid) => {
                const statusInfo = STATUS_LABELS[bid.status] ?? STATUS_LABELS.draft;
                return (
                  <button
                    key={bid.id}
                    onClick={() => handleLoad(bid)}
                    className="w-full text-left px-6 py-4 hover:bg-slate-800/50 transition group flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-slate-400">
                          {bid.bidNumber ?? '—'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                        {bid.version > 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-300">
                            v{bid.version}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-white truncate">{bid.jobName}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                        {bid.customerName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {bid.customerName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {bid.estimatorName}
                        </span>
                        <span className="flex items-center gap-1 capitalize">
                          <Building2 className="w-3 h-3" />
                          {bid.branch.replace('_', ' ')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(bid.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={(e) => handleDelete(e, bid)}
                        disabled={deleting === bid.id}
                        className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition"
                        title="Delete bid"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {bids.length} bid{bids.length !== 1 ? 's' : ''}
            {loading && ' · refreshing...'}
          </p>
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
