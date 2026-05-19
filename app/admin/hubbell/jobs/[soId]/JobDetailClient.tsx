'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, ShoppingCart, Plus, X, Check, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import PdfPreviewPanel from '../../../../../src/components/hubbell/PdfPreviewPanel';

type AttachedDoc = {
  document_id: string;
  doc_number: string;
  doc_type: string;
  match_source: string;
  posted_to_agility_at: string | null;
};

type SalesOrder = {
  so_id: number;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  expect_date: string | null;
  so_status: string | null;
  sale_type: string | null;
  created_date: string | null;
  order_total: string | null;
  attached_docs: AttachedDoc[];
};

type Doc = {
  id: string;
  doc_type: string;
  doc_number: string;
  extracted_total: string | null;
  payment_status: 'paid' | 'partial' | 'unpaid' | null;
  paid_amount_total: string | null;
  last_check_number: string | null;
  last_payment_date: string | null;
  match_status: string;
  received_at: string;
  dev_code: string | null;
  dev_name: string | null;
  attached_so_ids: number[];
};

type Bundle = {
  jobsite: {
    cust_codes: string;
    cust_names: string;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
    dev_code: string | null;
    dev_name: string | null;
    so_count: number;
    so_open_value: number;
    doc_count: number;
    hubbell_total: number;
    paid_total: number;
  };
  sales_orders: SalesOrder[];
  documents: Doc[];
};

function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (!Number.isFinite(v)) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

export default function JobDetailClient({ soId }: { soId: string }) {
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expandedSos, setExpandedSos] = useState<Set<number>>(new Set());
  const [attachSel, setAttachSel] = useState<Record<string, string>>({});
  const [manualEntry, setManualEntry] = useState<Record<string, string>>({});
  const [previewDoc, setPreviewDoc] = useState<{ id: string; number: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/hubbell/job?so_id=${soId}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(json.error ?? `HTTP ${r.status}`);
          setData(null);
          return;
        }
        setData(json);
      })
      .finally(() => setLoading(false));
  }, [soId]);

  useEffect(() => { load(); }, [load]);

  function toggleSo(id: number) {
    setExpandedSos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function attach(documentId: string, targetSoId: number) {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/hubbell/documents/${documentId}/attach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_id: targetSoId, source: 'manual', confidence: 100, reasons: ['manual_attach'] }),
      });
      const json = await r.json().catch(() => ({}));
      const wb = json.agility_writeback;
      if (wb?.attempted) {
        if (wb.success) {
          alert(
            `Attached SO ${targetSoId}.\n` +
            `Agility (${wb.mode}): wrote po_number = ${wb.new_po_number ?? '?'}` +
            (wb.skipped_reason ? `\n(${wb.skipped_reason})` : '')
          );
        } else {
          alert(
            `Attached SO ${targetSoId} in LiveEdge — but Agility writeback (${wb.mode}) FAILED:\n` +
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

  async function detach(documentId: string, targetSoId: number) {
    setBusy(true);
    try {
      await fetch(`/api/admin/hubbell/documents/${documentId}/detach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ so_id: targetSoId }),
      });
    } finally {
      setBusy(false);
      load();
    }
  }

  function handleAttachClick(docId: string) {
    const sel = attachSel[docId];
    const manual = manualEntry[docId];
    const target = manual ? parseInt(manual, 10) : sel ? parseInt(sel, 10) : NaN;
    if (!Number.isFinite(target)) {
      alert('Pick an SO from the dropdown or enter an SO# manually.');
      return;
    }
    attach(docId, target);
    setAttachSel((p) => ({ ...p, [docId]: '' }));
    setManualEntry((p) => ({ ...p, [docId]: '' }));
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-red-400">
        {error ?? 'Failed to load jobsite'}
        <div className="mt-2"><Link href="/admin/hubbell/jobs" className="text-cyan-400 hover:underline">Back to all jobs</Link></div>
      </div>
    );
  }

  const { jobsite, sales_orders, documents } = data;

  return (
    <div className={`p-4 sm:p-6 max-w-6xl mx-auto transition-[padding] ${previewDoc ? 'sm:pr-[55vw] lg:pr-[50vw] xl:pr-[45vw]' : ''}`}>
      <div className="mb-4">
        <Link href="/admin/hubbell/jobs" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All jobs
        </Link>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {jobsite.shipto_address_1 ?? '—'}
        </h1>
        <div className="text-sm text-slate-400 mt-1">
          {jobsite.shipto_city && <>{jobsite.shipto_city}, {jobsite.shipto_state} {jobsite.shipto_zip}</>}
          {jobsite.cust_codes && (
            <span className="text-slate-500 ml-2 font-mono">· {jobsite.cust_codes}</span>
          )}
        </div>
        {(jobsite.dev_code || jobsite.dev_name) && (
          <div className="text-xs text-slate-500 mt-1">
            Development: {jobsite.dev_name ?? '—'}
            {jobsite.dev_code && <span className="font-mono ml-2">({jobsite.dev_code})</span>}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-4 text-xs">
          <span className="px-3 py-2 bg-slate-900/40 border border-slate-800 rounded">
            <span className="text-slate-500">SOs:</span> <span className="text-slate-200 font-mono">{jobsite.so_count}</span>
          </span>
          <span className="px-3 py-2 bg-slate-900/40 border border-slate-800 rounded">
            <span className="text-slate-500">Open $:</span> <span className="text-slate-200 font-mono">{fmtMoney(jobsite.so_open_value)}</span>
          </span>
          <span className="px-3 py-2 bg-slate-900/40 border border-slate-800 rounded">
            <span className="text-slate-500">Docs:</span> <span className="text-slate-200 font-mono">{jobsite.doc_count}</span>
          </span>
          <span className="px-3 py-2 bg-slate-900/40 border border-slate-800 rounded">
            <span className="text-slate-500">Hubbell $:</span> <span className="text-slate-200 font-mono">{fmtMoney(jobsite.hubbell_total)}</span>
          </span>
          <span className="px-3 py-2 bg-slate-900/40 border border-slate-800 rounded">
            <span className="text-slate-500">Paid $:</span> <span className="text-emerald-300 font-mono">{fmtMoney(jobsite.paid_total)}</span>
          </span>
        </div>
      </div>

      {/* Sales orders */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Sales orders at this address
        </h2>
        {sales_orders.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No open HUBB1200/HUBB1700 SOs at this address.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 w-6"></th>
                  <th className="px-3 py-2 text-left">SO #</th>
                  <th className="px-3 py-2 text-left">Cust</th>
                  <th className="px-3 py-2 text-left">Reference</th>
                  <th className="px-3 py-2 text-left">Cust PO</th>
                  <th className="px-3 py-2 text-left">Expect</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Open $</th>
                  <th className="px-3 py-2 text-center">Docs</th>
                </tr>
              </thead>
              <tbody>
                {sales_orders.map((s) => {
                  const open = expandedSos.has(s.so_id);
                  return (
                    <Fragment key={s.so_id}>
                      <tr className="border-t border-slate-800">
                        <td className="px-2 py-1 align-top">
                          {s.attached_docs.length > 0 && (
                            <button onClick={() => toggleSo(s.so_id)} className="text-slate-500 hover:text-slate-200">
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-1">
                          <Link href={`/sales/orders/${s.so_id}`} className="text-cyan-400 hover:underline font-mono">
                            {s.so_id}
                          </Link>
                        </td>
                        <td className="px-3 py-1 font-mono text-xs">{s.cust_code ?? '—'}</td>
                        <td className="px-3 py-1 text-xs">{s.reference ?? '—'}</td>
                        <td className="px-3 py-1 font-mono text-xs">{s.po_number ?? '—'}</td>
                        <td className="px-3 py-1 text-xs">{s.expect_date ?? '—'}</td>
                        <td className="px-3 py-1 text-xs">{s.so_status ?? '—'}</td>
                        <td className="px-3 py-1 text-right tabular-nums font-mono">{fmtMoney(s.order_total)}</td>
                        <td className="px-3 py-1 text-center text-xs">{s.attached_docs.length}</td>
                      </tr>
                      {open && s.attached_docs.length > 0 && (
                        <tr className="bg-slate-900/30">
                          <td></td>
                          <td colSpan={8} className="px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                              {s.attached_docs.map((d) => (
                                <span key={d.document_id} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-800/60 border border-slate-700 rounded text-xs">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewDoc({ id: d.document_id, number: d.doc_number })}
                                    className="text-cyan-400 hover:underline font-mono"
                                  >
                                    {d.doc_number}
                                  </button>
                                  <span className="text-slate-500 uppercase">{d.doc_type}</span>
                                  {d.posted_to_agility_at && (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Hubbell documents */}
      <section>
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Hubbell documents at this address
        </h2>
        {documents.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No Hubbell docs at this address yet.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left">Doc #</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Payment</th>
                  <th className="px-3 py-2 text-left">Attached to</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => {
                  const isAttached = d.attached_so_ids.length > 0;
                  return (
                    <tr key={d.id} className="border-t border-slate-800 align-top">
                      <td className="px-3 py-2">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc({ id: d.id, number: d.doc_number })}
                            className="text-cyan-400 hover:underline font-mono inline-flex items-center gap-1"
                            title="Preview PDF"
                          >
                            <Eye className="w-3 h-3" />
                            {d.doc_number}
                          </button>
                          <Link
                            href={`/admin/hubbell/${d.id}`}
                            className="text-slate-500 hover:text-slate-300 text-[10px]"
                            title="Open detail page"
                          >
                            detail
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-2 uppercase text-xs">{d.doc_type}</td>
                      <td className="px-3 py-2 text-xs">{d.match_status}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-mono">{fmtMoney(d.extracted_total)}</td>
                      <td className="px-3 py-2 text-xs">
                        {d.payment_status ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] w-fit ${
                              d.payment_status === 'paid'    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50' :
                              d.payment_status === 'partial' ? 'bg-amber-900/40 text-amber-300 border border-amber-700/50' :
                                                                'bg-slate-700 text-slate-300'
                            }`}>{d.payment_status}</span>
                            {d.paid_amount_total && (
                              <span className="text-slate-400">{fmtMoney(d.paid_amount_total)}</span>
                            )}
                            {d.last_check_number && (
                              <span className="text-slate-500 text-[10px]">
                                #{d.last_check_number}
                                {d.last_payment_date && <> · {d.last_payment_date}</>}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {isAttached ? (
                          <div className="flex flex-wrap gap-1">
                            {d.attached_so_ids.map((sid) => (
                              <span key={sid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 border border-emerald-800/50 rounded">
                                <Link href={`/sales/orders/${sid}`} className="text-emerald-300 hover:underline font-mono">
                                  {sid}
                                </Link>
                                <button
                                  onClick={() => detach(d.id, sid)}
                                  disabled={busy}
                                  className="text-emerald-400 hover:text-red-400 disabled:opacity-40"
                                  title="Detach"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unattached</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1 flex-wrap">
                          <select
                            value={attachSel[d.id] ?? ''}
                            onChange={(e) => setAttachSel((p) => ({ ...p, [d.id]: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs"
                          >
                            <option value="">Pick SO…</option>
                            {sales_orders
                              .filter((s) => !d.attached_so_ids.includes(s.so_id))
                              .map((s) => (
                                <option key={s.so_id} value={s.so_id}>
                                  {s.so_id} — {s.cust_code ?? ''}
                                </option>
                              ))}
                          </select>
                          <input
                            type="text"
                            value={manualEntry[d.id] ?? ''}
                            onChange={(e) => setManualEntry((p) => ({ ...p, [d.id]: e.target.value }))}
                            placeholder="or SO#"
                            className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-xs w-20 font-mono"
                          />
                          <button
                            onClick={() => handleAttachClick(d.id)}
                            disabled={busy}
                            className="px-2 py-0.5 bg-cyan-900/40 border border-cyan-700/50 text-cyan-200 rounded text-xs hover:bg-cyan-900/60 disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Attach
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PdfPreviewPanel
        documentId={previewDoc?.id ?? null}
        docNumber={previewDoc?.number ?? null}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}
