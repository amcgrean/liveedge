'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, ExternalLink, X, Plus, AlertOctagon } from 'lucide-react';

type Document = {
  id: string;
  docType: 'po' | 'wo';
  docNumber: string;
  checkNumber: string | null;
  matchStatus: string;
  extractedAddress: string | null;
  extractedCity: string | null;
  extractedState: string | null;
  extractedZip: string | null;
  extractedTotal: string | null;
  extractedNeedBy: string | null;
  lineItems: Array<{ sku?: string; desc?: string; qty?: number; uom?: string; unit_price?: number; ext?: number }> | null;
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
  matchSource: 'address' | 'address_scrape' | 'po_number_split';
  confidence: number;
  matchReasons: string[];
};

type Detail = {
  document: Document;
  attached_sos: Attached[];
  candidate_sos: Candidate[];
};

export default function DocumentDetailClient({ documentId }: { documentId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualSo, setManualSo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/hubbell/documents/${documentId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [documentId]);

  useEffect(() => { load(); }, [load]);

  async function attach(soId: number, source: 'manual' | 'address' | 'address_scrape', confidence?: number, reasons?: string[]) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/hubbell/documents/${documentId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_id: soId, source, confidence, reasons }),
      });
      const json = await r.json().catch(() => ({}));
      const wb = json.agility_writeback;
      // Surface a brief toast-style alert so the reviewer sees write-back status.
      // Silent when writeback is disabled (default for prod until ops flips on).
      if (wb?.attempted) {
        if (wb.success) {
          alert(
            `Attached SO ${soId}.\n` +
            `Agility (${wb.mode}): wrote po_number = ${wb.new_po_number ?? '?'}` +
            (wb.skipped_reason ? `\n(${wb.skipped_reason})` : '')
          );
        } else {
          alert(
            `Attached SO ${soId} in LiveEdge — but Agility writeback (${wb.mode}) FAILED:\n` +
            `${wb.error ?? 'unknown error'}\n\n` +
            `The junction is recorded; retry the attach to re-attempt the writeback.`
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
    if (!confirm('Reject this document? It will be hidden from the matching workflow.')) return;
    setBusy(true);
    await fetch(`/api/admin/hubbell/documents/${documentId}/reject`, { method: 'POST' });
    setBusy(false);
    load();
  }
  async function viewPdf() {
    const r = await fetch(`/api/admin/hubbell/documents/${documentId}/pdf`);
    const { url } = await r.json();
    if (url) window.open(url, '_blank');
  }
  async function manualAttach() {
    const soId = parseInt(manualSo, 10);
    if (!Number.isFinite(soId)) { alert('Enter a numeric SO ID'); return; }
    await attach(soId, 'manual', 100, ['manual_attach']);
    setManualSo('');
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-red-400">Document not found</div>;

  const doc = data.document;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin/hubbell" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to inbox
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 uppercase">
            <FileText className="w-4 h-4" />
            {doc.docType} document
          </div>
          <h1 className="text-2xl font-semibold font-mono">{doc.docNumber}</h1>
          <div className="text-sm text-slate-500 mt-1">
            Received {new Date(doc.receivedAt).toLocaleString()}
            {doc.checkNumber && <> · Check #{doc.checkNumber}</>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={viewPdf} className="px-3 py-2 bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 rounded text-sm hover:bg-cyan-900/60">
            View PDF <ExternalLink className="inline w-3 h-3 ml-1" />
          </button>
          <button onClick={reject} disabled={busy} className="px-3 py-2 bg-red-900/30 border border-red-800/50 text-red-300 rounded text-sm hover:bg-red-900/50 disabled:opacity-50">
            <AlertOctagon className="inline w-4 h-4 mr-1" />Reject
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2 bg-slate-900/40 border border-slate-800 rounded p-4">
          <div className="text-xs uppercase text-slate-500 mb-2">Extracted Address</div>
          <div className="text-sm">
            {doc.extractedAddress || <span className="text-slate-600">—</span>}
            <div className="text-slate-400 mt-1">
              {[doc.extractedCity, doc.extractedState, doc.extractedZip].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
          {doc.scrapeCustCode && (
            <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>Local agent matched: <span className="font-mono text-slate-300">{doc.scrapeCustCode}</span></span>
              {doc.scrapeSeqNum && <span>seq <span className="font-mono text-slate-300">{doc.scrapeSeqNum}</span></span>}
              {doc.scrapeMatchRatio && (
                <span>ratio <span className="font-mono text-slate-300">{parseFloat(doc.scrapeMatchRatio).toFixed(2)}</span></span>
              )}
            </div>
          )}
        </div>
        <div className="bg-slate-900/40 border border-slate-800 rounded p-4">
          <div className="text-xs uppercase text-slate-500 mb-2">Totals</div>
          <div className="text-2xl font-mono">{doc.extractedTotal ? `$${parseFloat(doc.extractedTotal).toLocaleString()}` : '—'}</div>
          {doc.extractedNeedBy && <div className="text-xs text-slate-500 mt-1">Need by {doc.extractedNeedBy}</div>}
          {doc.paymentStatus && (
            <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded ${
                  doc.paymentStatus === 'paid'    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50' :
                  doc.paymentStatus === 'partial' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' :
                                                    'bg-slate-700 text-slate-300'
                }`}>{doc.paymentStatus}</span>
                {doc.paidAmountTotal && (
                  <span className="text-slate-400">
                    ${Math.round(parseFloat(doc.paidAmountTotal)).toLocaleString()} paid
                  </span>
                )}
              </div>
              {(doc.lastCheckNumber || doc.lastPaymentDate) && (
                <div className="text-slate-500">
                  {doc.lastCheckNumber && <>Check {doc.lastCheckNumber}</>}
                  {doc.lastCheckNumber && doc.lastPaymentDate && <> · </>}
                  {doc.lastPaymentDate}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(doc.devCode || doc.devName || doc.houseNumber || doc.blockLot || doc.modelElevation) && (
        <div className="mb-6 bg-slate-900/40 border border-slate-800 rounded p-4">
          <div className="text-xs uppercase text-slate-500 mb-3">Job context</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            {(doc.devCode || doc.devName) && (
              <div>
                <div className="text-xs text-slate-500">Development</div>
                <div className="text-slate-200">
                  {doc.devCode && <span className="font-mono">{doc.devCode}</span>}
                  {doc.devCode && doc.devName ? ' · ' : ''}
                  {doc.devName}
                </div>
              </div>
            )}
            {doc.houseNumber && (
              <div>
                <div className="text-xs text-slate-500">House #</div>
                <div className="text-slate-200 font-mono">{doc.houseNumber}</div>
              </div>
            )}
            {doc.blockLot && (
              <div>
                <div className="text-xs text-slate-500">Block / Lot</div>
                <div className="text-slate-200 font-mono">{doc.blockLot}</div>
              </div>
            )}
            {doc.modelElevation && (
              <div className="col-span-2 sm:col-span-4">
                <div className="text-xs text-slate-500">Model / Elevation</div>
                <div className="text-slate-200">{doc.modelElevation}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {doc.lineItems && doc.lineItems.length > 0 && (
        <div className="mb-6 rounded border border-slate-800">
          <div className="px-3 py-2 text-xs uppercase text-slate-500 bg-slate-900/40 border-b border-slate-800">Line items</div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">UoM</th>
                <th className="px-3 py-2 text-right">Unit</th>
                <th className="px-3 py-2 text-right">Ext</th>
              </tr>
            </thead>
            <tbody>
              {doc.lineItems.map((li, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="px-3 py-1 font-mono text-xs">{li.sku ?? '—'}</td>
                  <td className="px-3 py-1">{li.desc ?? '—'}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{li.qty ?? '—'}</td>
                  <td className="px-3 py-1">{li.uom ?? '—'}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{li.unit_price ? `$${li.unit_price.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{li.ext ? `$${li.ext.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Attached sales orders</h2>
        {data.attached_sos.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No SOs attached yet — confirm a candidate below or enter an SO# manually.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left">SO #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Cust PO</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.attached_sos.map((a) => (
                  <tr key={a.soId} className="border-t border-slate-800">
                    <td className="px-3 py-1 font-mono">
                      <Link href={`/admin/hubbell/jobs/${a.soId}`} className="text-cyan-400 hover:underline">
                        {a.soId}
                      </Link>
                    </td>
                    <td className="px-3 py-1">{a.so_header?.cust_name ?? a.so_header?.cust_code ?? '—'}</td>
                    <td className="px-3 py-1 text-slate-400 text-xs">{a.so_header?.shipto_address_1 ?? '—'}</td>
                    <td className="px-3 py-1 font-mono text-xs">{a.so_header?.po_number ?? '—'}</td>
                    <td className="px-3 py-1 text-xs">{a.so_header?.so_status ?? '—'}</td>
                    <td className="px-3 py-1 text-xs">
                      <span className="text-slate-400">{a.matchSource}</span>{' '}
                      <span className="text-slate-500">{a.confidence}%</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <button onClick={() => detach(a.soId)} disabled={busy} className="text-red-400 hover:text-red-300 disabled:opacity-50">
                        <X className="inline w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Candidate sales orders</h2>
        {data.candidate_sos.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No candidates surfaced by the matcher.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left">SO #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Cust PO</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Expect</th>
                  <th className="px-3 py-2 text-right">Order $</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.candidate_sos.map((c) => (
                  <tr key={c.soId} className="border-t border-slate-800">
                    <td className="px-3 py-1 font-mono">{c.soId}</td>
                    <td className="px-3 py-1">
                      <div>{c.custName ?? '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.custCode ?? ''}</div>
                    </td>
                    <td className="px-3 py-1 text-xs">{c.reference ?? '—'}</td>
                    <td className="px-3 py-1 font-mono text-xs">{c.poNumber ?? '—'}</td>
                    <td className="px-3 py-1 text-slate-400 text-xs">{c.shiptoAddress ?? '—'}</td>
                    <td className="px-3 py-1 text-xs">{c.expectDate ?? '—'}</td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {c.orderTotal ? `$${Math.round(parseFloat(c.orderTotal)).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-1 text-xs">{c.soStatus ?? '—'}</td>
                    <td className="px-3 py-1 text-right">
                      <button
                        onClick={() => attach(
                          c.soId,
                          c.matchSource === 'address' || c.matchSource === 'address_scrape'
                            ? c.matchSource
                            : 'manual',
                          c.confidence,
                          c.matchReasons,
                        )}
                        disabled={busy}
                        className="px-2 py-0.5 bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 rounded text-xs hover:bg-emerald-900/60 disabled:opacity-50"
                      >
                        <Plus className="inline w-3 h-3 mr-1" />Attach
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Manual attach</h2>
        <div className="flex gap-2 items-center text-sm">
          <input
            value={manualSo}
            onChange={(e) => setManualSo(e.target.value)}
            placeholder="SO #"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded font-mono"
          />
          <button
            onClick={manualAttach}
            disabled={busy || !manualSo}
            className="px-3 py-2 bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 rounded hover:bg-cyan-900/60 disabled:opacity-50"
          >
            Attach by SO#
          </button>
        </div>
      </section>
    </div>
  );
}
