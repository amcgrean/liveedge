'use client';

import React, { useEffect, useState } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '../../../../src/components/nav/TopNav';
import { ArrowLeft, Building2, Calendar, ChevronRight } from 'lucide-react';

interface BidRow {
  id: string;
  source: 'legacy' | 'estimator';
  name: string;
  estimator: string | null;
  status: string;
  planType: string | null;
  logDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  specs: string[];
  href: string;
}

interface Customer { id: number; name: string; code: string }
interface Counts { legacy: number; estimator: number; total: number }

const LEGACY_STATUS: Record<string, string> = {
  Incomplete: 'bg-yellow-900/60 text-yellow-300',
  Complete: 'bg-green-900/60 text-green-300',
  'On Hold': 'bg-gray-700 text-gray-300',
  Cancelled: 'bg-red-900/60 text-red-300',
};
const EST_STATUS: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-300',
  submitted: 'bg-blue-900/60 text-blue-300',
  won: 'bg-green-900/60 text-green-300',
  lost: 'bg-red-900/60 text-red-300',
};

function statusBadge(source: 'legacy' | 'estimator', status: string) {
  const map = source === 'legacy' ? LEGACY_STATUS : EST_STATUS;
  const cls = map[status] ?? 'bg-gray-700 text-gray-300';
  return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${cls}`}>{status}</span>;
}

function sourceBadge(source: 'legacy' | 'estimator') {
  return source === 'legacy'
    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/40 text-amber-400 border border-amber-700/30">Bid Tracker</span>
    : <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-900/40 text-cyan-400 border border-cyan-700/30">Estimator</span>;
}

interface Props { session: Session }

export default function CustomerBidsClient({ session }: Props) {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ legacy: 0, estimator: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/customers/${customerId}/bids`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setCustomer(data.customer);
        setBids(data.bids ?? []);
        setCounts(data.counts ?? { legacy: 0, estimator: 0, total: 0 });
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [customerId]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={(session.user as { role?: string }).role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/all-bids" className="p-2 rounded-lg hover:bg-gray-800 print:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {customer ? (
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-gray-400" />
                <h1 className="text-2xl font-bold">{customer.name}</h1>
                <span className="text-sm font-mono text-cyan-400">{customer.code}</span>
              </div>
              <p className="text-sm text-gray-400 mt-0.5">
                {counts.total} bid{counts.total !== 1 ? 's' : ''} — {counts.legacy} bid tracker, {counts.estimator} estimator
              </p>
            </div>
          ) : (
            <h1 className="text-2xl font-bold">Customer Bids</h1>
          )}
        </div>

        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs">
                <th className="px-4 py-3 text-left font-medium">Source</th>
                <th className="px-4 py-3 text-left font-medium">Name / Plan</th>
                <th className="px-4 py-3 text-left font-medium">Estimator</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Logged</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
                <th className="px-4 py-3 text-left font-medium">Specs</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : bids.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No bids found for this customer</td></tr>
              ) : bids.map((bid) => (
                <tr key={bid.id} className="border-b border-gray-800/50 hover:bg-gray-800/40">
                  <td className="px-4 py-3">{sourceBadge(bid.source)}</td>
                  <td className="px-4 py-3">
                    <Link href={bid.href} className="text-white hover:text-cyan-400 font-medium">{bid.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{bid.estimator ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{bid.planType ?? '—'}</td>
                  <td className="px-4 py-3">{statusBadge(bid.source, bid.status)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(bid.logDate)}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(bid.dueDate)}</td>
                  <td className="px-4 py-3">
                    {bid.specs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {bid.specs.map((s) => <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-400">{s}</span>)}
                      </div>
                    ) : <span className="text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <Link href={bid.href} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white inline-flex">
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
