'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, Building2, FileText, DollarSign,
  Mail, CheckCircle, Clock, Package, Wrench, AlertTriangle,
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

// Mirrors SoHeader — used for related SOs from ERP at the same address
type RelatedSO = SoHeader;

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

// Normalize a PO/WO number for comparison
function normPo(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase().replace(/^0+/, '');
}

export default function JobEmailsClient({ soId }: { soId: string }) {
  const [soHeader, setSoHeader]     = useState<SoHeader | null>(null);
  const [emails, setEmails]         = useState<EmailEntry[]>([]);
  const [relatedSOs, setRelatedSOs] = useState<RelatedSO[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

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
        setRelatedSOs(data.relatedSOs ?? []);
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

  // Build a map: normalized PO/WO number → email (for reconciliation matching)
  const poToEmail = new Map<string, EmailEntry>();
  for (const email of emails) {
    if (email.extractedPoNumber) poToEmail.set(normPo(email.extractedPoNumber), email);
    if (email.extractedWoNumber) poToEmail.set(normPo(email.extractedWoNumber), email);
  }

  // Track which emails are matched to a specific SO by PO# field
  const matchedEmailIds = new Set<string>();
  for (const so of relatedSOs) {
    if (so.po_number) {
      const e = poToEmail.get(normPo(so.po_number));
      if (e) matchedEmailIds.add(e.id);
    }
  }

  // Emails that haven't been matched to any related SO's po_number
  const unmatchedEmails = emails.filter((e) => !matchedEmailIds.has(e.id));

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link href="/admin/hubbell/jobs" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">
            {soHeader?.cust_name ?? 'Loading…'}
          </h1>
          <p className="text-sm text-slate-400">
            PO/WO reconciliation for this job
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
        <div className="space-y-2">
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
        </div>
      )}

      {/* ── RECONCILIATION PANEL ── */}
      {relatedSOs.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">PO / WO Reconciliation</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Sales orders at this address matched against received PO/WO emails.
                Starting next week, SOs will carry the Hubbell WO# in the Customer PO field.
              </p>
            </div>
            <span className="text-xs text-slate-500">{relatedSOs.length} SOs</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-slate-950/40">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sales Order</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer PO # (WO)</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sale Type</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Email Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {relatedSOs.map((so) => {
                  const matchedEmail = so.po_number ? poToEmail.get(normPo(so.po_number)) : undefined;
                  const hasPo = !!so.po_number;

                  return (
                    <tr
                      key={so.so_id}
                      className={cn(
                        'transition',
                        matchedEmail   ? 'bg-green-500/5 hover:bg-green-500/10'
                          : hasPo      ? 'bg-amber-500/5 hover:bg-amber-500/10'
                          : 'hover:bg-white/5'
                      )}
                    >
                      {/* SO number */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link
                          href={`/admin/hubbell/jobs/${so.so_id}`}
                          className={cn(
                            'font-mono text-xs font-semibold hover:underline',
                            so.so_id === soId ? 'text-cyan-400' : 'text-slate-300'
                          )}
                        >
                          #{so.so_id}
                        </Link>
                        {so.so_id === soId && (
                          <span className="ml-1.5 text-[10px] text-cyan-600">current</span>
                        )}
                      </td>

                      {/* Customer PO # field (where Hubbell WO will go) */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {so.po_number ? (
                          <span className="font-mono text-xs text-white">{so.po_number}</span>
                        ) : (
                          <span className="text-xs text-slate-600 italic">not set yet</span>
                        )}
                      </td>

                      {/* Sale type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-400">{so.sale_type ?? '—'}</span>
                      </td>

                      {/* SO status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-400">{so.so_status ?? '—'}</span>
                      </td>

                      {/* Email match status */}
                      <td className="px-4 py-3">
                        {matchedEmail ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            <div>
                              <Link
                                href={`/admin/hubbell/${matchedEmail.id}`}
                                className="text-xs text-green-300 hover:text-green-200 transition font-mono"
                              >
                                {matchedEmail.extractedWoNumber ?? matchedEmail.extractedPoNumber}
                              </Link>
                              <p className="text-[10px] text-slate-500">{formatDate(matchedEmail.receivedAt)}</p>
                            </div>
                          </div>
                        ) : hasPo ? (
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-xs text-amber-400">No email received</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                            <span className="text-xs text-slate-600">Awaiting WO# from ERP</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Unmatched emails — received but not linked to any SO by PO# */}
          {unmatchedEmails.length > 0 && (
            <div className="border-t border-white/10 px-5 py-3">
              <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {unmatchedEmails.length} email{unmatchedEmails.length > 1 ? 's' : ''} received but not linked to a sales order PO# field
              </p>
              <div className="space-y-1">
                {unmatchedEmails.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 text-xs text-slate-400">
                    <TypeIcon type={e.emailType} />
                    <span className="font-mono text-slate-300">
                      {e.extractedWoNumber ?? e.extractedPoNumber ?? '—'}
                    </span>
                    <Link href={`/admin/hubbell/${e.id}`} className="text-cyan-500 hover:text-cyan-300 transition">
                      {e.subject}
                    </Link>
                    <span className="text-slate-600">{formatDate(e.receivedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── EMAIL TABLE ── */}
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
          <div className="px-5 py-3 border-b border-white/10">
            <h2 className="text-sm font-semibold text-white">Emails Received</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">PO / WO #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">From</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">SO Linked</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {emails.map((email) => {
                const emailKey = normPo(email.extractedWoNumber ?? email.extractedPoNumber);
                const linkedSO = relatedSOs.find((so) => so.po_number && normPo(so.po_number) === emailKey);
                return (
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
                      {linkedSO ? (
                        <div className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          <span className="font-mono">#{linkedSO.so_id}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600 italic">no SO match</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                      {formatDate(email.receivedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3 text-sm">
        <Link href="/admin/hubbell/jobs" className="text-slate-400 hover:text-white transition">
          ← Back to jobs
        </Link>
        <span className="text-slate-700">|</span>
        <Link href="/admin/hubbell" className="text-slate-400 hover:text-white transition">
          Email inbox
        </Link>
        <span className="text-slate-700">|</span>
        <Link href={`/admin/jobs/${soId}`} className="text-cyan-500 hover:text-cyan-300 transition">
          View in Job Review →
        </Link>
      </div>
    </div>
  );
}
