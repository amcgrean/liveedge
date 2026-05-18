'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Link2 } from 'lucide-react';

type So = {
  so_id: number;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  so_status: string | null;
  sale_type: string | null;
  shipto_address_1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  created_date: string | null;
  expect_date: string | null;
};

type AttachedDoc = {
  document_id: string;
  doc_type: string;
  doc_number: string;
  match_source: string;
  confidence: number;
  extracted_total: string | null;
  extracted_need_by: string | null;
  match_status: string;
  received_at: string;
};

type SiblingSo = {
  so_id: number;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  so_status: string | null;
  shipto_address_1: string | null;
  shared_doc_count: number;
};

type UnattachedDoc = {
  document_id: string;
  doc_type: string;
  doc_number: string;
  extracted_address: string | null;
  extracted_total: string | null;
  match_status: string;
  received_at: string;
};

type Data = {
  so: So;
  attached_docs: AttachedDoc[];
  sibling_sos: SiblingSo[];
  unattached_address_docs: UnattachedDoc[];
};

export default function JobDetailClient({ soId }: { soId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/hubbell/jobs/${soId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [soId]);

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  if (!data?.so) return <div className="p-6 text-sm text-red-400">SO not found</div>;

  const { so } = data;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href="/admin/hubbell/jobs" className="text-sm text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All jobs
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold">SO #{so.so_id}</h1>
        <div className="text-sm text-slate-400 mt-1">
          <span>{so.cust_name}</span>
          {so.cust_code && <span className="text-slate-500 ml-2 font-mono">({so.cust_code})</span>}
        </div>
        <div className="text-sm text-slate-500">
          {so.shipto_address_1}
          {so.shipto_city && <> · {so.shipto_city}, {so.shipto_state} {so.shipto_zip}</>}
        </div>
        <div className="text-xs text-slate-500 mt-2 flex gap-3">
          <span>Status: <span className="text-slate-300">{so.so_status ?? '—'}</span></span>
          <span>Type: <span className="text-slate-300">{so.sale_type ?? '—'}</span></span>
          <span>Cust PO: <span className="text-slate-300 font-mono">{so.po_number ?? '—'}</span></span>
          <span>Expect: <span className="text-slate-300">{so.expect_date ?? '—'}</span></span>
        </div>
      </div>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Hubbell documents on this SO
        </h2>
        {data.attached_docs.length === 0 ? (
          <div className="text-sm text-slate-500 italic">None attached.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left">Doc #</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Need by</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Match</th>
                </tr>
              </thead>
              <tbody>
                {data.attached_docs.map((d) => (
                  <tr key={d.document_id} className="border-t border-slate-800">
                    <td className="px-3 py-1">
                      <Link href={`/admin/hubbell/${d.document_id}`} className="text-cyan-400 hover:underline font-mono">
                        {d.doc_number}
                      </Link>
                    </td>
                    <td className="px-3 py-1 uppercase text-xs">{d.doc_type}</td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {d.extracted_total ? `$${parseFloat(d.extracted_total).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-1 text-xs">{d.extracted_need_by ?? '—'}</td>
                    <td className="px-3 py-1 text-xs">{d.match_status}</td>
                    <td className="px-3 py-1 text-xs text-slate-400">
                      {d.match_source} · {d.confidence}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Link2 className="w-4 h-4" /> Sibling SOs (sharing a Hubbell doc with this one)
        </h2>
        {data.sibling_sos.length === 0 ? (
          <div className="text-sm text-slate-500 italic">No siblings.</div>
        ) : (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left">SO #</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-center">Shared docs</th>
                </tr>
              </thead>
              <tbody>
                {data.sibling_sos.map((s) => (
                  <tr key={s.so_id} className="border-t border-slate-800">
                    <td className="px-3 py-1">
                      <Link href={`/admin/hubbell/jobs/${s.so_id}`} className="text-cyan-400 hover:underline font-mono">
                        {s.so_id}
                      </Link>
                    </td>
                    <td className="px-3 py-1">{s.cust_name ?? s.cust_code ?? '—'}</td>
                    <td className="px-3 py-1 text-slate-400 text-xs">{s.shipto_address_1 ?? '—'}</td>
                    <td className="px-3 py-1 text-xs">{s.so_status ?? '—'}</td>
                    <td className="px-3 py-1 text-center">{s.shared_doc_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data.unattached_address_docs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Other Hubbell docs at this address (unattached)</h2>
          <div className="overflow-x-auto rounded border border-amber-900/40">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 bg-amber-900/10">
                <tr>
                  <th className="px-3 py-2 text-left">Doc #</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.unattached_address_docs.map((d) => (
                  <tr key={d.document_id} className="border-t border-amber-900/30">
                    <td className="px-3 py-1">
                      <Link href={`/admin/hubbell/${d.document_id}`} className="text-cyan-400 hover:underline font-mono">
                        {d.doc_number}
                      </Link>
                    </td>
                    <td className="px-3 py-1 uppercase text-xs">{d.doc_type}</td>
                    <td className="px-3 py-1 text-slate-400 text-xs">{d.extracted_address ?? '—'}</td>
                    <td className="px-3 py-1 text-right tabular-nums">
                      {d.extracted_total ? `$${parseFloat(d.extracted_total).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-3 py-1 text-xs">{d.match_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
