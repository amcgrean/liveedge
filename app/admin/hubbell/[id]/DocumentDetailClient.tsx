'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  FileText,
  X,
  Plus,
  Check,
  Shield,
  Clock,
} from 'lucide-react';
import PdfPreviewPanel from '../../../../src/components/hubbell/PdfPreviewPanel';

// ── Types ─────────────────────────────────────────────────────────────
type Document = {
  id: string;
  docType: 'po' | 'wo';
  docNumber: string;
  checkNumber: string | null;
  matchStatus: 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected';
  extractedAddress: string | null;
  extractedCity: string | null;
  extractedState: string | null;
  extractedZip: string | null;
  extractedTotal: string | null;
  extractedNeedBy: string | null;
  lineItems: Array<{
    sku?: string;
    desc?: string;
    qty?: number;
    uom?: string;
    unit_price?: number;
    ext?: number;
  }> | null;
  scrapeCustCode: string | null;
  scrapeSeqNum: string | null;
  scrapeMatchRatio: string | null;
  devCode: string | null;
  devName: string | null;
  houseNumber: string | null;
  blockLot: string | null;
  modelElevation: string | null;
  paymentStatus: 'paid' | 'partial' | 'unpaid' | null;
  paidAmountTotal: string | null;
  lastPaymentDate: string | null;
  lastCheckNumber: string | null;
  receivedAt: string;
};

type Attached = {
  soId: number;
  matchSource: string;
  confidence: number;
  matchReasons: string[];
  so_header: {
    so_id: number;
    cust_name: string | null;
    cust_code: string | null;
    so_status: string | null;
    reference: string | null;
    po_number: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
  } | null;
};

type Candidate = {
  soId: number;
  custCode: string | null;
  custName: string | null;
  poNumber: string | null;
  reference: string | null;
  shiptoAddress: string | null;
  shiptoCity: string | null;
  shiptoState: string | null;
  shiptoZip: string | null;
  soStatus: string | null;
  expectDate: string | null;
  orderTotal: string | null;
  matchSource: 'address' | 'address_scrape' | 'po_number_split' | string;
  confidence: number;
  matchReasons: string[];
};

type Detail = {
  document: Document;
  attached_sos: Attached[];
  candidate_sos: Candidate[];
};

type SoSearchResult = {
  so_id: number;
  reference: string | null;
  cust_code: string | null;
  cust_name: string | null;
  so_status: string | null;
  shipto_address_1: string | null;
  order_total: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────
function fmtUSD(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtUSD2(n: number): string {
  return (
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}
function parseNum(s: string | null | undefined): number {
  if (s === null || s === undefined) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ─────────────────────────────────────────────────────────
export default function DocumentDetailClient({ documentId }: { documentId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/hubbell/documents/${documentId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => {
    load();
    setShowAllLines(false);
  }, [load]);

  async function attach(
    soId: number,
    source: 'manual' | 'address' | 'address_scrape',
    confidence?: number,
    reasons?: string[],
  ) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/hubbell/documents/${documentId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_id: soId, source, confidence, reasons }),
      });
      const json = await r.json().catch(() => ({}));
      const wb = json.agility_writeback;
      if (wb?.attempted) {
        if (wb.success) {
          alert(
            `Attached SO ${soId}.\n` +
              `Agility (${wb.mode}): wrote po_number = ${wb.new_po_number ?? '?'}` +
              (wb.skipped_reason ? `\n(${wb.skipped_reason})` : ''),
          );
        } else {
          alert(
            `Attached SO ${soId} in LiveEdge — but Agility writeback (${wb.mode}) FAILED:\n` +
              `${wb.error ?? 'unknown error'}\n\n` +
              `The junction is recorded; retry the attach to re-attempt the writeback.`,
          );
        }
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  async function detach(soId: number) {
    setBusy(true);
    await fetch(`/api/admin/hubbell/documents/${documentId}/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ so_id: soId }),
    });
    setBusy(false);
    load();
  }

  async function reject() {
    if (!confirm('Reject this document? It will be hidden from the matching workflow.'))
      return;
    setBusy(true);
    await fetch(`/api/admin/hubbell/documents/${documentId}/reject`, { method: 'POST' });
    setBusy(false);
    load();
  }

  if (loading)
    return (
      <div className="p-6 text-sm text-slate-500">Loading…</div>
    );
  if (!data)
    return (
      <div className="p-6 text-sm text-red-400">Document not found</div>
    );

  const doc = data.document;
  const lines = doc.lineItems ?? [];
  const visibleLines = showAllLines ? lines : lines.slice(0, 8);
  const hiddenCount = Math.max(0, lines.length - 8);
  const candidates = [...data.candidate_sos].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="text-slate-200">
      {/* Page header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Link href="/admin" className="hover:text-slate-300">
              Admin
            </Link>
            <span className="text-slate-600">›</span>
            <Link href="/admin/hubbell" className="hover:text-slate-300">
              Hubbell
            </Link>
            <span className="text-slate-600">›</span>
            <span className="font-mono text-slate-300">{doc.docNumber}</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2.5">
            <span className="font-mono">{doc.docNumber}</span>
            <MatchBadge status={doc.matchStatus} />
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/hubbell"
            className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded text-xs inline-flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to inbox
          </Link>
        </div>
      </div>

      <div className="p-5 max-w-[1500px] mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-5">
          {/* ───────── LEFT: Document Context ───────── */}
          <div className="flex flex-col gap-3.5">
            <SectionLabel>Document Context</SectionLabel>

            {/* Identity */}
            <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-[52px] h-[52px] flex-none rounded-lg flex flex-col items-center justify-center ${
                    doc.docType === 'wo'
                      ? 'bg-purple-900/20 border border-purple-700/40 text-purple-300'
                      : 'bg-cyan-900/20 border border-cyan-700/40 text-cyan-300'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  <span className="font-mono text-[9px] font-bold tracking-wider mt-0.5">
                    {doc.docType.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-2xl font-semibold leading-tight">
                    {doc.docNumber}
                  </div>
                  <div
                    className="flex items-center gap-2.5 mt-1.5 text-xs text-slate-500 flex-wrap"
                    title={new Date(doc.receivedAt).toLocaleString()}
                  >
                    <span>
                      Received{' '}
                      <span className="font-mono text-slate-300">
                        {formatRelative(doc.receivedAt)}
                      </span>
                    </span>
                    <PaymentBadge
                      status={doc.paymentStatus}
                      paid={doc.paidAmountTotal}
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setPdfOpen(true)}
                className="w-full mt-3.5 h-9 inline-flex items-center justify-center gap-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded text-sm"
              >
                <FileText className="w-3.5 h-3.5" /> View PDF
              </button>
            </div>

            {/* Job Address */}
            <Panel title="Job Address" sub="from PDF">
              <div className="p-3.5">
                <div className="text-sm text-slate-200 leading-relaxed">
                  {doc.extractedAddress ?? '—'}
                  <br />
                  {[doc.extractedCity, doc.extractedState, doc.extractedZip]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </div>
                {(doc.devCode ||
                  doc.devName ||
                  doc.houseNumber ||
                  doc.blockLot ||
                  doc.modelElevation) && (
                  <div className="flex gap-1.5 flex-wrap mt-3">
                    {doc.devCode && (
                      <CtxPill k="DEV" v={doc.devCode + (doc.devName ? ` · ${doc.devName}` : '')} />
                    )}
                    {doc.houseNumber && <CtxPill k="House" v={doc.houseNumber} />}
                    {doc.blockLot && <CtxPill k="Blk/Lot" v={doc.blockLot} />}
                    {doc.modelElevation && <CtxPill k="Model" v={doc.modelElevation} />}
                  </div>
                )}
                {doc.scrapeCustCode && (
                  <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      Local agent matched:{' '}
                      <span className="font-mono text-slate-300">{doc.scrapeCustCode}</span>
                    </span>
                    {doc.scrapeSeqNum && (
                      <span>
                        seq <span className="font-mono text-slate-300">{doc.scrapeSeqNum}</span>
                      </span>
                    )}
                    {doc.scrapeMatchRatio && (
                      <span>
                        ratio{' '}
                        <span className="font-mono text-slate-300">
                          {parseFloat(doc.scrapeMatchRatio).toFixed(2)}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            {/* Line Items */}
            {lines.length > 0 && (
              <Panel
                title="Line Items"
                sub={`${lines.length} lines · from PDF parsing`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500 bg-slate-900/40">
                      <tr>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2">UOM</th>
                        <th className="px-3 py-2 text-right">Unit</th>
                        <th className="px-3 py-2 text-right">Ext</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((li, i) => {
                        const ext =
                          li.ext ?? (li.qty ?? 0) * (li.unit_price ?? 0);
                        return (
                          <tr key={i} className="border-t border-slate-800/60">
                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">
                              {li.sku ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-slate-200">
                              {li.desc ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                              {li.qty ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500">
                              {li.uom ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-300">
                              {li.unit_price ? fmtUSD2(li.unit_price) : '—'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono tabular-nums font-medium">
                              {ext ? fmtUSD2(ext) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowAllLines(!showAllLines)}
                    className="w-full py-2 text-xs text-cyan-400 border-t border-slate-800/60 hover:bg-slate-800/30"
                  >
                    {showAllLines ? 'Show fewer' : `Show ${hiddenCount} more`}
                  </button>
                )}
                <div className="px-3.5 py-2 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                    PDF Total
                  </span>
                  <span className="font-mono text-base font-semibold">
                    {doc.extractedTotal ? fmtUSD2(parseNum(doc.extractedTotal)) : '—'}
                  </span>
                </div>
              </Panel>
            )}

            {/* Payments */}
            <Panel title="Payments">
              <div className="p-3.5">
                <PaymentDetail
                  status={doc.paymentStatus}
                  paid={doc.paidAmountTotal}
                  total={doc.extractedTotal}
                  check={doc.lastCheckNumber}
                  date={doc.lastPaymentDate}
                />
              </div>
            </Panel>

            {/* Reject */}
            <div>
              <button
                onClick={reject}
                disabled={busy}
                className="px-3 py-1.5 border border-red-800/40 text-red-400 hover:bg-red-950/30 rounded text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Reject document
              </button>
            </div>
          </div>

          {/* ───────── RIGHT: Agility Match ───────── */}
          <div className="flex flex-col gap-3.5">
            <SectionLabel>Agility Match</SectionLabel>

            {/* Attached SOs */}
            <Panel
              title="Attached SOs"
              sub={`${data.attached_sos.length} attached`}
            >
              {data.attached_sos.length === 0 ? (
                <div className="px-3.5 py-5 text-sm text-slate-500 text-center">
                  No SOs attached
                </div>
              ) : (
                <div>
                  {data.attached_sos.map((a) => (
                    <div
                      key={a.soId}
                      className="flex items-center gap-3 px-3.5 py-3 border-b border-slate-800/60 last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <Link
                            href={`/admin/hubbell/jobs/${a.soId}`}
                            className="font-mono text-base font-semibold text-cyan-400 hover:underline"
                          >
                            SO {a.soId}
                          </Link>
                          {a.so_header?.reference && (
                            <span className="text-slate-400">
                              — {a.so_header.reference}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono">{a.so_header?.cust_code ?? '—'}</span>
                          {a.so_header?.cust_name && <> · {a.so_header.cust_name}</>}
                        </div>
                      </div>
                      <SoStatusChip status={a.so_header?.so_status ?? null} />
                      <button
                        onClick={() => detach(a.soId)}
                        disabled={busy}
                        className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded disabled:opacity-50"
                      >
                        Detach
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Candidate Matches */}
            <Panel
              title="Candidate Matches"
              sub={`${candidates.length} ranked`}
              headerExtra={
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold bg-emerald-900/20 border border-emerald-700/50 rounded px-1.5 py-px">
                  Matcher ran
                </span>
              }
            >
              {candidates.length === 0 ? (
                <div className="px-3.5 py-5 text-sm text-slate-500 text-center">
                  No automatic candidates — use manual attach below
                </div>
              ) : (
                <div className="p-3 flex flex-col gap-2.5">
                  {candidates.map((c) => (
                    <CandidateCard
                      key={c.soId}
                      c={c}
                      busy={busy}
                      onAttach={() =>
                        attach(
                          c.soId,
                          c.matchSource === 'address' || c.matchSource === 'address_scrape'
                            ? c.matchSource
                            : 'manual',
                          c.confidence,
                          c.matchReasons,
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>

            {/* Manual Attach */}
            <Panel title="Manual Attach">
              <div className="p-3.5">
                <ManualAttach
                  busy={busy}
                  attached={new Set(data.attached_sos.map((a) => a.soId))}
                  onAttach={(soId) => attach(soId, 'manual', 100, ['manual_attach'])}
                />
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {/* PDF slide-out drawer */}
      <PdfPreviewPanel
        documentId={pdfOpen ? documentId : null}
        docNumber={doc.docNumber}
        onClose={() => setPdfOpen(false)}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">
      {children}
    </div>
  );
}

function Panel({
  title,
  sub,
  headerExtra,
  children,
}: {
  title: string;
  sub?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-md overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{title}</span>
            {headerExtra}
          </div>
          {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function CtxPill({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded bg-slate-800 border border-slate-700">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {k}
      </span>
      <span className="font-mono text-xs text-slate-100 font-medium">{v}</span>
    </span>
  );
}

function MatchBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    unmatched: 'bg-slate-700 text-slate-200',
    auto_matched: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    confirmed: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    rejected: 'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
        styles[status] || styles.unmatched
      }`}
    >
      {status.replace('_', '-')}
    </span>
  );
}

function PaymentBadge({
  status,
  paid,
}: {
  status: 'paid' | 'partial' | 'unpaid' | null;
  paid: string | null;
}) {
  if (!status || status === 'unpaid') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300">
        UNPAID
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-amber-900/40 text-amber-300 border border-amber-700/50">
        PARTIAL {paid ? fmtUSD(parseNum(paid)) : ''}
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-emerald-900/40 text-emerald-300 border border-emerald-700/50">
      PAID
    </span>
  );
}

function SoStatusChip({ status }: { status: string | null }) {
  if (!status) return null;
  const upper = status.toUpperCase();
  const styles: Record<string, string> = {
    B: 'bg-slate-700 text-slate-200',
    O: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
    S: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    P: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
    I: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    C: 'bg-slate-700 text-slate-400',
    X: 'bg-red-900/30 text-red-300 border border-red-800/50',
  };
  const label: Record<string, string> = {
    B: 'OPEN',
    O: 'OPEN',
    S: 'STAGED',
    P: 'PICKING',
    I: 'INVOICED',
    C: 'CLOSED',
    X: 'CANCELED',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
        styles[upper] ?? 'bg-slate-700 text-slate-200'
      }`}
    >
      {label[upper] ?? upper}
    </span>
  );
}

function CandidateCard({
  c,
  busy,
  onAttach,
}: {
  c: Candidate;
  busy: boolean;
  onAttach: () => void;
}) {
  const verified = c.matchSource === 'po_number_split';
  return (
    <div
      className={`border rounded-md p-3.5 ${
        verified
          ? 'border-emerald-700/50 bg-emerald-900/10'
          : 'border-slate-800 bg-slate-800/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold leading-tight tracking-tight">
            <span className="font-mono text-emerald-400">SO {c.soId}</span>
            {c.reference && <span className="text-slate-200"> — {c.reference}</span>}
          </div>
          <div className="text-xs text-slate-300 mt-1.5">
            <span className="font-mono">{c.custCode ?? '—'}</span>
            {c.shiptoAddress && <> · {c.shiptoAddress}</>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {c.expectDate && <>Expect: {c.expectDate} · </>}
            Status:{' '}
            <span className="capitalize">{c.soStatus ?? '—'}</span>
            {c.orderTotal && (
              <>
                {' · '}
                <span className="font-mono text-slate-300">
                  {fmtUSD(parseNum(c.orderTotal))}
                </span>
              </>
            )}
          </div>
        </div>
        {verified ? (
          <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-700/50 bg-emerald-900/20 whitespace-nowrap">
            <Shield className="w-3 h-3" /> Verified
          </span>
        ) : (
          <ConfBadge value={c.confidence} />
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {verified ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-300">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            Buyer typed this doc# into{' '}
            <span className="font-mono font-semibold text-slate-100">SO {c.soId}</span>
          </span>
        ) : (
          <>
            <span className="text-[11px] text-slate-500">Signals:</span>
            {(c.matchReasons ?? []).map((s, i) => (
              <SignalChip key={i}>{s}</SignalChip>
            ))}
          </>
        )}
        <span className="flex-1" />
        <button
          onClick={onAttach}
          disabled={busy}
          className="px-2.5 py-1 inline-flex items-center gap-1 text-xs bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 hover:bg-cyan-900/60 rounded disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Attach
        </button>
      </div>
    </div>
  );
}

function ConfBadge({ value }: { value: number }) {
  const tier = value >= 75 ? 'high' : value >= 50 ? 'mid' : 'low';
  const styles = {
    high: 'text-emerald-400 border-emerald-700/50 bg-emerald-900/20',
    mid: 'text-amber-400 border-amber-700/50 bg-amber-900/20',
    low: 'text-slate-400 border-slate-700 bg-slate-800',
  } as const;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        Conf
      </span>
      <span
        className={`font-mono text-sm font-semibold px-1.5 py-px rounded border ${styles[tier]}`}
      >
        {value}
      </span>
    </span>
  );
}

function SignalChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center h-[19px] px-1.5 text-[11px] text-slate-300 rounded bg-slate-800 border border-slate-700">
      {children}
    </span>
  );
}

function PaymentDetail({
  status,
  paid,
  total,
  check,
  date,
}: {
  status: 'paid' | 'partial' | 'unpaid' | null;
  paid: string | null;
  total: string | null;
  check: string | null;
  date: string | null;
}) {
  if (!status || status === 'unpaid') {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <span className="w-2 h-2 rounded-full bg-slate-600" /> No payment recorded
      </div>
    );
  }
  if (status === 'partial') {
    return (
      <div>
        <div className="flex items-center gap-2 text-amber-400 font-medium">
          <Clock className="w-4 h-4" /> Partial — {fmtUSD2(parseNum(paid))} of{' '}
          {fmtUSD2(parseNum(total))} paid
        </div>
        {(check || date) && (
          <Link
            href="/admin/hubbell?section=checks"
            className="font-mono text-xs text-cyan-400 hover:underline mt-2 inline-block"
          >
            {check && <>Check #{check}</>}
            {check && date && ' · '}
            {date}
            {' ↗'}
          </Link>
        )}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 text-emerald-400 font-medium">
        <Check className="w-4 h-4" /> Paid in full
      </div>
      {(check || date) && (
        <Link
          href="/admin/hubbell?section=checks"
          className="font-mono text-xs text-cyan-400 hover:underline mt-2 inline-block"
        >
          {check && <>Check #{check}</>}
          {check && date && ' · '}
          {date}
          {' ↗'}
        </Link>
      )}
    </div>
  );
}

function ManualAttach({
  busy,
  attached,
  onAttach,
}: {
  busy: boolean;
  attached: Set<number>;
  onAttach: (soId: number) => void;
}) {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<SoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced live search.
  useEffect(() => {
    const digits = input.replace(/[^0-9]/g, '');
    if (digits.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/admin/hubbell/so-search?q=${encodeURIComponent(digits)}`)
        .then((r) => r.json())
        .then((j: { results: SoSearchResult[] }) => {
          setResults((j.results ?? []).filter((r) => !attached.has(r.so_id)));
        })
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [input, attached]);

  const exact = useMemo(() => {
    const digits = parseInt(input.replace(/[^0-9]/g, ''), 10);
    if (!Number.isFinite(digits)) return null;
    return results.find((r) => r.so_id === digits) ?? null;
  }, [input, results]);

  return (
    <>
      <label className="text-xs text-slate-300 block mb-2">
        Attach by SO number
      </label>
      <div className="flex gap-2 relative">
        <div className="flex-1 relative">
          <div className="flex items-center w-full h-9 px-3 bg-slate-800 border border-slate-700 rounded gap-2">
            <span className="font-mono text-slate-500 text-sm">SO</span>
            <input
              inputMode="numeric"
              placeholder="e.g. 9717"
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="flex-1 bg-transparent outline-none text-sm font-mono"
            />
          </div>
          {input && results.length > 0 && (
            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-slate-800 border border-slate-700 rounded shadow-2xl z-30 overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.so_id}
                  onClick={() => {
                    onAttach(r.so_id);
                    setInput('');
                    setResults([]);
                  }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 border-b border-slate-800/60 last:border-b-0 hover:bg-slate-700 text-xs"
                >
                  <span className="font-mono text-emerald-400 font-semibold">
                    SO {r.so_id}
                  </span>
                  {r.reference && <span className="text-slate-200">{r.reference}</span>}
                  <span className="flex-1" />
                  <span className="font-mono text-slate-500">{r.cust_code ?? '—'}</span>
                  {r.so_status && <SoStatusChip status={r.so_status} />}
                  <span className="font-mono text-slate-300">
                    {r.order_total ? fmtUSD(parseNum(r.order_total)) : '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {input && !searching && results.length === 0 && (
            <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-slate-800 border border-slate-700 rounded shadow-xl z-30 px-3 py-2 text-xs text-slate-500">
              No open Hubbell SOs match.
            </div>
          )}
        </div>
        <button
          disabled={busy || !exact}
          onClick={() => {
            if (exact) {
              onAttach(exact.so_id);
              setInput('');
              setResults([]);
            }
          }}
          className={`h-9 px-3 inline-flex items-center gap-1 text-xs bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 hover:bg-cyan-900/60 rounded ${
            !exact || busy ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <Plus className="w-3 h-3" /> Attach
        </button>
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        Start typing to search open Hubbell sales orders.
      </div>
    </>
  );
}

