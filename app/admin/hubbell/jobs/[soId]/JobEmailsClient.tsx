'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Building2, FileText, DollarSign,
  Mail, CheckCircle, Clock, Package, Wrench,
} from 'lucide-react';
import { cn } from '../../../../../src/lib/utils';

type SoHeader = {
  so_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  sale_type: string | null;
  so_status: string | null;
  salesperson: string | null;
  expect_date: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
};

type EmailEntry = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  emailType: string | null;
  matchStatus: string;
  matchConfidence: string | null;
  extractedPoNumber: string | null;
  extractedWoNumber: string | null;
  extractedAmount: string | null;
  extractedDescription: string | null;
  extractedAddress: string | null;
  extractedCity: string | null;
  receivedAt: string;
};

type Summary = {
  totalAmount: number;
  poCount: number;
  woCount: number;
  emailCount: number;
  duplicateCount: number;
};

function formatAmount(v: string | number | null): string {
  if (v == null) return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TypeIcon({ type }: { type: string | null }) {
  if (type === 'po') return <Package className="w-3.5 h-3.5 text-blue-400" />;
  if (type === 'wo') return <Wrench className="w-3.5 h-3.5 text-purple-400" />;
  return <Mail className="w-3.5 h-3.5 text-slate-400" />;
}

export default function JobEmailsClient({ soId }: { soId: string }) {
  const [soHeader, setSoHeader] = useState<SoHeader | null>(null);
  const [emails, setEmails]     = useState<EmailEntry[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/admin/hubbell/jobs/${soId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        setSoHeader(data.soHeader);
        setEmails(data.emails);
        setSummary(data.summary);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [soId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-800" />)}
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">{error}</div>;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link href="/admin/hubbell" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">
            {soHeader?.cust_name ?? 'Unknown customer'}
          </h1>
          <p className="text-sm text-slate-400">
            PO/WO emails for this job
            <span className="ml-2 text-slate-600 font-mono text-xs">#{soId}</span>
          </p>
        </div>
      </div>

      {/* SO Header card */}
      {soHeader && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Customer</p>
            <p className="text-white font-medium">{soHeader.cust_name}</p>
            {soHeader.cust_code && <p className="text-xs text-slate-500">{soHeader.cust_code}</p>}
          </div>
          {soHeader.reference && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Reference</p>
              <p className="text-slate-200">{soHeader.reference}</p>
            </div>
          )}
          {soHeader.po_number && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">ERP PO #</p>
              <p className="text-slate-200 font-mono">{soHeader.po_number}</p>
            </div>
          )}
          {(soHeader.shipto_address_1 || soHeader.shipto_city) && (
            <div className="col-span-2 md:col-span-3">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Ship-to Address</p>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-slate-200 text-sm">
                  {[soHeader.shipto_address_1, soHeader.shipto_city, soHeader.shipto_state, soHeader.shipto_zip]
                    .filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
            <p className="text-slate-200">{soHeader.so_status ?? '—'}</p>
          </div>
          {soHeader.expect_date && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Expected</p>
              <p className="text-slate-200">{soHeader.expect_date}</p>
            </div>
          )}
          {soHeader.salesperson && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Salesperson</p>
              <p className="text-slate-200">{soHeader.salesperson}</p>
            </div>
          )}
        </div>
      )}

      {/* Summary stats */}
      {summary && summary.emailCount > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Unique PO/WOs', value: summary.emailCount, icon: Mail, color: 'text-slate-300' },
              { label: 'PO Emails',     value: summary.poCount,    icon: Package, color: 'text-blue-300' },
              { label: 'WO Emails',     value: summary.woCount,    icon: Wrench,  color: 'text-purple-300' },
              { label: 'Total Amount',  value: formatAmount(summary.totalAmount), icon: DollarSign, color: 'text-green-300' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn('w-4 h-4', color)} />
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
                <p className={cn('text-2xl font-bold', color)}>{value}</p>
              </div>
            ))}
          </div>
          {summary.duplicateCount > 0 && (
            <p className="text-xs text-slate-500">
              {summary.duplicateCount} duplicate {summary.duplicateCount === 1 ? 'email' : 'emails'} with the same PO/WO number hidden — amounts counted once per order.
            </p>
          )}
        </>
      )}

      {/* PO/WO table */}
      {emails.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-10 text-center">
          <Building2 className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">No PO/WO emails confirmed for this job yet.</p>
          <Link href="/admin/hubbell" className="text-cyan-500 hover:text-cyan-300 text-sm mt-2 inline-block transition">
            View pending emails →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">PO / WO #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">From</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-white/5 transition">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <TypeIcon type={email.emailType} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs text-slate-200">
                      {email.extractedPoNumber && <div className="text-blue-300">PO: {email.extractedPoNumber}</div>}
                      {email.extractedWoNumber && <div className="text-purple-300">WO: {email.extractedWoNumber}</div>}
                      {!email.extractedPoNumber && !email.extractedWoNumber && <span className="text-slate-600">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/admin/hubbell/${email.id}`}
                      className="text-white hover:text-cyan-400 transition line-clamp-1 block"
                    >
                      {email.extractedDescription || email.subject}
                    </Link>
                    {email.extractedAddress && (
                      <span className="text-xs text-slate-500">{email.extractedAddress}, {email.extractedCity}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-sm font-medium text-slate-200">
                    {formatAmount(email.extractedAmount)}
                  </td>
                  <td className="px-4 py-3 max-w-[140px]">
                    <span className="text-xs text-slate-400 truncate block">
                      {email.fromName || email.fromEmail}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {email.matchStatus === 'confirmed' ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <CheckCircle className="w-3 h-3" /> Confirmed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-cyan-400">
                        <Clock className="w-3 h-3" /> Auto-matched
                      </span>
                    )}
                    {email.matchConfidence && (
                      <span className="text-xs text-slate-600 ml-4">
                        {Math.round(parseFloat(email.matchConfidence))}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                    {formatDate(email.receivedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3 text-sm">
        <Link href="/admin/hubbell" className="text-slate-400 hover:text-white transition">
          ← Back to inbox
        </Link>
        <span className="text-slate-700">|</span>
        <Link href={`/admin/jobs/${soId}`} className="text-cyan-500 hover:text-cyan-300 transition">
          View in Job Review →
        </Link>
      </div>
    </div>
  );
}
