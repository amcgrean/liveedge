'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Mail, CheckCircle, AlertCircle, Clock, XCircle,
  MapPin, DollarSign, FileText, Tag, User, RotateCcw, Calendar, Phone,
} from 'lucide-react';
import { cn } from '../../../../src/lib/utils';

type Candidate = {
  id: string;
  soId: string;
  systemId: string | null;
  custCode: string | null;
  custName: string | null;
  reference: string | null;
  shiptoAddress: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  confidence: string;
  matchReasons: string[] | null;
  rank: number;
};

type EmailDetail = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  emailType: string | null;
  matchStatus: string;
  confirmedSoId: string | null;
  confirmedCustCode: string | null;
  confirmedCustName: string | null;
  matchConfidence: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  extractedPoNumber: string | null;
  extractedWoNumber: string | null;
  extractedAddress: string | null;
  extractedCity: string | null;
  extractedState: string | null;
  extractedZip: string | null;
  extractedAmount: string | null;
  extractedTaxAmount: string | null;
  extractedShipping: string | null;
  extractedNeedByDate: string | null;
  extractedContactName: string | null;
  extractedContactPhone: string | null;
  extractedDescription: string | null;
  receivedAt: string;
};

function confidenceColor(c: number) {
  if (c >= 80) return 'text-green-400';
  if (c >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function confidenceBg(c: number) {
  if (c >= 80) return 'bg-green-500';
  if (c >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

function StatusBadge({ status }: { status: string }) {
  const base = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium';
  switch (status) {
    case 'confirmed': return <span className={cn(base, 'bg-green-500/15 text-green-300')}><CheckCircle className="w-3.5 h-3.5" />Confirmed</span>;
    case 'matched':   return <span className={cn(base, 'bg-cyan-500/15 text-cyan-300')}><CheckCircle className="w-3.5 h-3.5" />Auto-matched</span>;
    case 'pending':   return <span className={cn(base, 'bg-amber-500/15 text-amber-300')}><Clock className="w-3.5 h-3.5" />Pending review</span>;
    case 'unmatched': return <span className={cn(base, 'bg-red-500/15 text-red-300')}><AlertCircle className="w-3.5 h-3.5" />No match found</span>;
    case 'rejected':  return <span className={cn(base, 'bg-slate-700 text-slate-400')}><XCircle className="w-3.5 h-3.5" />Rejected</span>;
    default:          return <span className={cn(base, 'bg-slate-700 text-slate-300')}><Mail className="w-3.5 h-3.5" />{status}</span>;
  }
}

export default function EmailDetailClient({ emailId }: { emailId: string }) {
  const [email, setEmail]           = useState<EmailDetail | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [acting, setActing]         = useState(false);
  const [actionMsg, setActionMsg]   = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/hubbell/emails/${emailId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEmail(data.email);
      setCandidates(data.candidates);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [emailId]);

  async function doAction(action: 'confirm' | 'reject' | 'reset', c?: Candidate) {
    setActing(true);
    setActionMsg('');
    try {
      const body: Record<string, unknown> = { action };
      if (action === 'confirm' && c) {
        body.soId       = c.soId;
        body.custCode   = c.custCode;
        body.custName   = c.custName;
        body.confidence = parseFloat(c.confidence);
      }
      const res = await fetch(`/api/admin/hubbell/emails/${emailId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      setActionMsg(action === 'confirm' ? `Confirmed: SO #${c?.soId}` : action === 'reject' ? 'Marked as rejected.' : 'Reset to pending.');
      await load();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-800" />
        ))}
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">{error}</div>;
  if (!email) return null;

  const amount   = email.extractedAmount   ? parseFloat(email.extractedAmount)   : null;
  const tax      = email.extractedTaxAmount ? parseFloat(email.extractedTaxAmount) : null;
  const shipping = email.extractedShipping  ? parseFloat(email.extractedShipping)  : null;

  function fmtMoney(v: number) {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso: string) {
    // iso is YYYY-MM-DD
    const [y, m, d] = iso.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/hubbell" className="mt-1 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-white truncate">{email.subject}</h1>
            <StatusBadge status={email.matchStatus} />
            {email.emailType && email.emailType !== 'other' && (
              <span className={cn(
                'px-2 py-0.5 rounded text-xs font-bold uppercase',
                email.emailType === 'po' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
              )}>
                {email.emailType}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
            {' · '}
            {new Date(email.receivedAt).toLocaleString()}
          </p>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm text-cyan-300">
          {actionMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Extracted data card */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Extracted Data</h2>

          <dl className="space-y-3">
            {email.extractedPoNumber && (
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">PO Number</dt>
                  <dd className="text-sm text-white font-mono">{email.extractedPoNumber}</dd>
                </div>
              </div>
            )}
            {email.extractedWoNumber && (
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">WO Number</dt>
                  <dd className="text-sm text-white font-mono">{email.extractedWoNumber}</dd>
                </div>
              </div>
            )}
            {(email.extractedAddress || email.extractedCity) && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">Job Site Address</dt>
                  <dd className="text-sm text-white">
                    {[email.extractedAddress, email.extractedCity, email.extractedState, email.extractedZip]
                      .filter(Boolean).join(', ')}
                  </dd>
                </div>
              </div>
            )}
            {amount != null && (
              <div className="flex items-start gap-3">
                <DollarSign className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">Order Total</dt>
                  <dd className="text-sm text-white font-mono font-semibold">{fmtMoney(amount)}</dd>
                  {(tax != null || shipping != null) && (
                    <div className="flex gap-4 mt-1">
                      {tax != null && (
                        <span className="text-xs text-slate-500">Tax: <span className="text-slate-400 font-mono">{fmtMoney(tax)}</span></span>
                      )}
                      {shipping != null && (
                        <span className="text-xs text-slate-500">Shipping: <span className="text-slate-400 font-mono">{fmtMoney(shipping)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {email.extractedNeedByDate && (
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">Need By</dt>
                  <dd className="text-sm text-white">{fmtDate(email.extractedNeedByDate)}</dd>
                </div>
              </div>
            )}
            {(email.extractedContactName || email.extractedContactPhone) && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">Contact</dt>
                  <dd className="text-sm text-slate-200">
                    {email.extractedContactName}
                    {email.extractedContactName && email.extractedContactPhone && ' · '}
                    {email.extractedContactPhone && (
                      <span className="font-mono text-xs">{email.extractedContactPhone}</span>
                    )}
                  </dd>
                </div>
              </div>
            )}
            {email.extractedDescription && (
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <dt className="text-xs text-slate-500">Description</dt>
                  <dd className="text-sm text-slate-200">{email.extractedDescription}</dd>
                </div>
              </div>
            )}
          </dl>
        </div>

        {/* Current match / actions */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Match Status</h2>

          {email.confirmedSoId ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
                <p className="text-xs text-green-400 font-semibold uppercase tracking-wide mb-2">Matched to Job</p>
                <Link
                  href={`/admin/hubbell/jobs/${email.confirmedSoId}`}
                  className="text-white font-bold text-lg hover:text-cyan-400 transition block"
                >
                  {email.confirmedCustName ?? `Job #${email.confirmedSoId}`}
                </Link>
                {email.confirmedCustName && (
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">Job #{email.confirmedSoId}</p>
                )}
                {email.matchConfidence && (
                  <p className="text-xs text-slate-500 mt-1">
                    Confidence: {Math.round(parseFloat(email.matchConfidence))}%
                  </p>
                )}
              </div>
              {email.confirmedBy && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User className="w-3.5 h-3.5" />
                  {email.confirmedBy === 'address_cache'
                    ? 'Auto-confirmed via address cache'
                    : email.matchStatus === 'matched'
                      ? 'Auto-matched'
                      : `Confirmed by ${email.confirmedBy}`}
                  {email.confirmedAt && ` · ${new Date(email.confirmedAt).toLocaleDateString()}`}
                </div>
              )}
              <button
                onClick={() => doAction('reset')}
                disabled={acting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to pending
              </button>
            </div>
          ) : email.matchStatus === 'unmatched' ? (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
              No job site address match found in ERP. Address extraction may have failed, or this job is not in the system yet.
            </div>
          ) : email.matchStatus === 'rejected' ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-800 border border-white/10 p-4 text-sm text-slate-400">
                Marked as rejected — not tied to any job.
              </div>
              <button
                onClick={() => doAction('reset')}
                disabled={acting}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to pending
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-400">
              Waiting for review. Select a candidate below to confirm the match.
            </div>
          )}

          {/* Reject button for pending */}
          {(email.matchStatus === 'pending') && (
            <button
              onClick={() => doAction('reject')}
              disabled={acting}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm border border-red-500/20 transition disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              Mark as not a job email
            </button>
          )}
        </div>
      </div>

      {/* Candidates */}
      {candidates.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Match Candidates
            <span className="ml-2 text-slate-500 font-normal normal-case text-xs">Sorted by confidence</span>
          </h2>

          <div className="space-y-3">
            {candidates.map((c) => {
              const conf = Math.round(parseFloat(c.confidence));
              const isConfirmed = email.confirmedSoId === c.soId;
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-lg border p-4 transition',
                    isConfirmed
                      ? 'border-green-500/40 bg-green-500/10'
                      : 'border-white/10 bg-slate-800/60 hover:border-white/20'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link
                          href={`/admin/hubbell/jobs/${c.soId}`}
                          className="text-white font-bold hover:text-cyan-400 transition"
                        >
                          SO #{c.soId}
                        </Link>
                        {c.systemId && (
                          <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">{c.systemId}</span>
                        )}
                        {isConfirmed && (
                          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                            <CheckCircle className="w-3 h-3" /> Confirmed
                          </span>
                        )}
                      </div>
                      {c.custName && <p className="text-sm text-slate-300 mt-1">{c.custName}</p>}
                      {c.reference && <p className="text-xs text-slate-500">Ref: {c.reference}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-400">
                          {[c.shiptoAddress, c.shiptoCity, c.shiptoState, c.shiptoZip].filter(Boolean).join(', ')}
                        </span>
                      </div>
                      {c.matchReasons && c.matchReasons.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {(c.matchReasons as string[]).map((r) => (
                            <span key={r} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700 text-slate-400">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Confidence meter */}
                      <div className="text-right">
                        <span className={cn('text-xl font-bold', confidenceColor(conf))}>{conf}%</span>
                        <div className="w-24 h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', confidenceBg(conf))}
                            style={{ width: `${conf}%` }}
                          />
                        </div>
                      </div>

                      {!isConfirmed && (email.matchStatus === 'pending' || email.matchStatus === 'matched') && (
                        <button
                          onClick={() => doAction('confirm', c)}
                          disabled={acting}
                          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition disabled:opacity-50"
                        >
                          Confirm match
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw email body */}
      {email.bodyText && (
        <details className="rounded-xl border border-white/10">
          <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-slate-400 hover:text-white transition select-none">
            Raw email body
          </summary>
          <pre className="px-5 pb-5 text-xs text-slate-400 whitespace-pre-wrap font-mono overflow-x-auto">
            {email.bodyText}
          </pre>
        </details>
      )}
    </div>
  );
}
