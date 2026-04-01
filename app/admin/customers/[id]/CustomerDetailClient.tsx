'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { Session } from 'next-auth';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '../../../../src/components/nav/TopNav';
import { ArrowLeft, FileText, Ruler, Layers, ExternalLink } from 'lucide-react';

interface Customer {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  isActive: boolean;
}

interface Bid {
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

interface Design {
  id: number;
  planNumber: string;
  planName: string;
  projectAddress: string;
  contractor: string | null;
  logDate: string | null;
  status: string;
  planDescription: string | null;
  squareFootage: number | null;
  designerName: string | null;
  href: string;
}

interface EWP {
  id: number;
  planNumber: string;
  address: string;
  loginDate: string | null;
  tjiDepth: string;
  assignedDesigner: string | null;
  layoutFinalized: string | null;
  agilityQuote: string | null;
  href: string;
}

interface Props {
  session: Session;
}

export default function CustomerDetailClient({ session }: Props) {
  const params = useParams();
  const custId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [bids, setBids]         = useState<Bid[]>([]);
  const [designs, setDesigns]   = useState<Design[]>([]);
  const [ewp, setEwp]           = useState<EWP[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [custRes, bidsRes, designsRes, ewpRes] = await Promise.all([
        fetch(`/api/customers/${custId}`),
        fetch(`/api/customers/${custId}/bids`),
        fetch(`/api/customers/${custId}/designs`),
        fetch(`/api/customers/${custId}/ewp`),
      ]);

      if (!custRes.ok) { setError('Customer not found'); return; }
      const custData    = await custRes.json();
      const bidsData    = bidsRes.ok    ? await bidsRes.json()    : { bids: [] };
      const designsData = designsRes.ok ? await designsRes.json() : { designs: [] };
      const ewpData     = ewpRes.ok     ? await ewpRes.json()     : { ewp: [] };

      setCustomer(custData.customer);
      setBids(bidsData.bids ?? []);
      setDesigns(designsData.designs ?? []);
      setEwp(ewpData.ewp ?? []);
    } catch {
      setError('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }, [custId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav userName={session.user?.name} userRole={session.user?.role} />
        <div className="max-w-5xl mx-auto px-4 py-8 text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav userName={session.user?.name} userRole={session.user?.role} />
        <div className="max-w-5xl mx-auto px-4 py-8 text-red-400">{error || 'Customer not found'}</div>
      </div>
    );
  }

  const legacyBids    = bids.filter((b) => b.source === 'legacy');
  const estimatorBids = bids.filter((b) => b.source === 'estimator');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/admin/customers" className="p-2 rounded-lg hover:bg-gray-800">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{customer.name}</h1>
            <p className="text-sm text-gray-400">
              {customer.code}{customer.contactName ? ` — ${customer.contactName}` : ''}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Bids', value: legacyBids.length },
            { label: 'Designs', value: designs.length },
            { label: 'EWP Records', value: ewp.length },
            { label: 'Takeoff Bids', value: estimatorBids.length },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-cyan-400">{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bids */}
        <section>
          <h2 className="font-semibold text-sm text-gray-300 flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-cyan-400" />
            Bids ({legacyBids.length})
          </h2>
          {legacyBids.length === 0 ? (
            <p className="text-sm text-gray-500">No bids on file.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {legacyBids.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-xs text-gray-400">
                      {b.planType} · {b.estimator ?? 'Unassigned'} · Logged {fmt(b.logDate)}
                      {b.dueDate ? ` · Due ${fmt(b.dueDate)}` : ''}
                    </p>
                    {b.specs.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{b.specs.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      b.status === 'Complete'
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-yellow-900/50 text-yellow-300'
                    }`}>
                      {b.status}
                    </span>
                    <Link href={b.href} className="text-gray-400 hover:text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Designs */}
        <section>
          <h2 className="font-semibold text-sm text-gray-300 flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-cyan-400" />
            Designs ({designs.length})
          </h2>
          {designs.length === 0 ? (
            <p className="text-sm text-gray-500">No designs on file.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {designs.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {d.planNumber} — {d.planName}
                    </p>
                    <p className="text-xs text-gray-400">
                      {d.projectAddress}
                      {d.designerName ? ` · ${d.designerName}` : ''}
                      {d.squareFootage ? ` · ${d.squareFootage.toLocaleString()} sf` : ''}
                      {d.logDate ? ` · ${fmt(d.logDate)}` : ''}
                    </p>
                    {d.planDescription && (
                      <p className="text-xs text-gray-500 mt-0.5">{d.planDescription}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status === 'Active'
                        ? 'bg-cyan-900/50 text-cyan-300'
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {d.status}
                    </span>
                    <Link href={d.href} className="text-gray-400 hover:text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* EWP */}
        <section>
          <h2 className="font-semibold text-sm text-gray-300 flex items-center gap-2 mb-3">
            <Ruler className="w-4 h-4 text-cyan-400" />
            EWP / Layouts ({ewp.length})
          </h2>
          {ewp.length === 0 ? (
            <p className="text-sm text-gray-500">No EWP records on file.</p>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {ewp.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {e.planNumber} — {e.address}
                    </p>
                    <p className="text-xs text-gray-400">
                      TJI {e.tjiDepth}
                      {e.assignedDesigner ? ` · ${e.assignedDesigner}` : ''}
                      {e.loginDate ? ` · Logged ${fmt(e.loginDate)}` : ''}
                    </p>
                    {(e.layoutFinalized || e.agilityQuote) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {e.layoutFinalized ? `Layout ${fmt(e.layoutFinalized)}` : ''}
                        {e.layoutFinalized && e.agilityQuote ? ' · ' : ''}
                        {e.agilityQuote ? `Quote ${fmt(e.agilityQuote)}` : ''}
                      </p>
                    )}
                  </div>
                  <Link href={e.href} className="text-gray-400 hover:text-cyan-400 ml-4 flex-shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Estimator (UUID) bids */}
        {estimatorBids.length > 0 && (
          <section>
            <h2 className="font-semibold text-sm text-gray-300 flex items-center gap-2 mb-3">
              <Ruler className="w-4 h-4 text-cyan-400" />
              Takeoff Estimates ({estimatorBids.length})
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
              {estimatorBids.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-xs text-gray-400">
                      {b.estimator ?? 'Unknown'} · {fmt(b.logDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                      {b.status}
                    </span>
                    <Link href={b.href} className="text-gray-400 hover:text-cyan-400">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
