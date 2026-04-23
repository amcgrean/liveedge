'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, FileText, Paperclip, ExternalLink,
  Upload, Mail, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { CreditDetail } from '../../api/credits/[id]/route';
import type { CreditImage } from '../../api/credits/[id]/images/route';

type ImagesResponse = { images: CreditImage[] };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtQty(v: string | null) {
  if (!v) return '—';
  const n = parseFloat(v);
  return isNaN(n) ? v : n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

function fmtPrice(v: string | null) {
  if (!v) return '—';
  const n = parseFloat(v);
  return isNaN(n) ? v : `$${n.toFixed(2)}`;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? '').toUpperCase();
  const isOpen = s === 'O' || s === 'B' || s === '';
  const cls =
    isOpen ? 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50' :
    s === 'S' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' :
                'bg-gray-800 text-gray-400 border-gray-700';
  const label = isOpen ? 'Open' : s === 'S' ? 'Staged' : (s || '—');
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>{label}</span>
  );
}

function ImagesSection({ soId }: { soId: string }) {
  const [images, setImages] = useState<CreditImage[] | null>(null);
  const [error, setError] = useState('');
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadImages() {
    setImages(null);
    setError('');
    fetch(`/api/credits/${soId}/images`)
      .then((r) => r.ok ? r.json() as Promise<ImagesResponse> : Promise.reject())
      .then((d) => setImages(d.images))
      .catch(() => setError('Could not load attachments.'));
  }

  useEffect(() => { loadImages(); }, [soId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openImage(imgId: number) {
    setViewingId(imgId);
    try {
      const r = await fetch(`/api/credits/${imgId}/image`);
      if (!r.ok) throw new Error();
      const { url } = await r.json() as { url: string };
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Could not retrieve file URL.');
    } finally {
      setViewingId(null);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only PDF, JPG, PNG, GIF, and WebP files are allowed.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const sp = new URLSearchParams({ filename: file.name, content_type: file.type });
      const presignRes = await fetch(`/api/credits/${soId}/upload?${sp}`);
      if (!presignRes.ok) throw new Error('Could not get upload URL');
      const { upload_url, r2_key } = await presignRes.json() as { upload_url: string; r2_key: string };
      const putRes = await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!putRes.ok) throw new Error('Upload to storage failed');
      const confirmRes = await fetch(`/api/credits/${soId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, r2_key, content_type: file.type }),
      });
      if (!confirmRes.ok) throw new Error('Could not save record');
      loadImages();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const count = images?.length ?? 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">Attachments</span>
          {images !== null && (
            <span className="text-xs text-gray-500">({count})</span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronUp className="w-4 h-4 text-gray-500" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 border-t border-gray-800 pt-3">
          {/* Upload */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded transition-colors"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
            <span className="text-xs text-gray-600">PDF, JPG, PNG</span>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" className="hidden" onChange={handleFileSelect} />
          </div>
          {uploadError && <p className="text-xs text-red-400 mb-2">{uploadError}</p>}

          {/* List */}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!error && !images && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
          {!error && images?.length === 0 && (
            <p className="text-xs text-gray-500">No attachments yet.</p>
          )}
          <div className="flex flex-col gap-2">
            {images?.map((img) => (
              <div key={img.id} className="flex items-center gap-3 bg-gray-800/60 rounded px-3 py-2">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate font-medium">{img.filename}</p>
                  {img.email_from && (
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3" />{img.email_from}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-600 shrink-0">{fmt(img.received_at)}</span>
                {img.has_file ? (
                  <button
                    onClick={() => openImage(img.id)}
                    disabled={viewingId === img.id}
                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 shrink-0"
                  >
                    {viewingId === img.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    View
                  </button>
                ) : (
                  <span className="text-xs text-gray-600 shrink-0">No file</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreditDetailClient({ soId }: { soId: string }) {
  const [detail, setDetail] = useState<CreditDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/credits/${soId}`)
      .then((r) => r.ok ? r.json() as Promise<CreditDetail> : Promise.reject(r.status))
      .then(setDetail)
      .catch((status) => setError(status === 404 ? 'Credit memo not found.' : 'Could not load credit memo.'));
  }, [soId]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/credits" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Credits
        </Link>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  const addr = [detail.address_1, detail.city, detail.state, detail.zip].filter(Boolean).join(', ');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Back link */}
      <Link href="/credits" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Credits
      </Link>

      {/* Header card */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-cyan-400 font-mono">CM #{detail.so_id}</h1>
              <StatusBadge status={detail.so_status} />
            </div>
            <p className="text-gray-400 mt-0.5">{detail.cust_name ?? '—'}</p>
            {detail.cust_code && <p className="text-xs text-gray-600">{detail.cust_code}</p>}
          </div>
          <div className="text-right text-xs text-gray-500 shrink-0">
            <p>Branch: <span className="text-gray-300">{detail.system_id}</span></p>
            {detail.salesperson && <p>Rep: <span className="text-gray-300">{detail.salesperson}</span></p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-0.5">Reference</p>
            <p className="text-gray-200">{detail.reference || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-0.5">PO #</p>
            <p className="text-gray-200">{detail.po_number || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-0.5">Created</p>
            <p className="text-gray-200">{fmt(detail.created_date)}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-0.5">Expected</p>
            <p className="text-gray-200">{fmt(detail.expect_date)}</p>
          </div>
          {addr && (
            <div className="col-span-2">
              <p className="text-gray-500 uppercase tracking-wider mb-0.5">Ship-to Address</p>
              <p className="text-gray-200">{addr}</p>
            </div>
          )}
          {detail.ship_via && (
            <div>
              <p className="text-gray-500 uppercase tracking-wider mb-0.5">Ship Via</p>
              <p className="text-gray-200">{detail.ship_via}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">
            Line Items <span className="text-gray-500 font-normal">({detail.lines.length})</span>
          </h2>
        </div>
        {detail.lines.length === 0 ? (
          <p className="px-5 py-4 text-xs text-gray-500">No line items found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/50 text-left">
                  <th className="px-4 py-2 text-gray-400 font-medium">#</th>
                  <th className="px-4 py-2 text-gray-400 font-medium">Item</th>
                  <th className="px-4 py-2 text-gray-400 font-medium">Description</th>
                  <th className="px-4 py-2 text-gray-400 font-medium hidden sm:table-cell">Size</th>
                  <th className="px-4 py-2 text-gray-400 font-medium text-right">Ord</th>
                  <th className="px-4 py-2 text-gray-400 font-medium text-right">Shpd</th>
                  <th className="px-4 py-2 text-gray-400 font-medium text-right">Price</th>
                  <th className="px-4 py-2 text-gray-400 font-medium hidden md:table-cell">UOM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {detail.lines.map((line, i) => (
                  <tr key={line.sequence ?? i} className="hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 text-gray-500">{line.sequence ?? i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-cyan-400">{line.item_code || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-200 max-w-[240px]">
                      <p className="truncate">{line.description || '—'}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 hidden sm:table-cell">{line.size || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-300 text-right">{fmtQty(line.qty_ordered)}</td>
                    <td className="px-4 py-2.5 text-gray-300 text-right">{fmtQty(line.qty_shipped)}</td>
                    <td className="px-4 py-2.5 text-gray-300 text-right">{fmtPrice(line.price)}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{line.uom || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shipments */}
      {detail.shipments.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">
              Shipments <span className="text-gray-500 font-normal">({detail.shipments.length})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800/50 text-left">
                  <th className="px-4 py-2 text-gray-400 font-medium">Shipment</th>
                  <th className="px-4 py-2 text-gray-400 font-medium">Invoice Date</th>
                  <th className="px-4 py-2 text-gray-400 font-medium">Ship Date</th>
                  <th className="px-4 py-2 text-gray-400 font-medium hidden sm:table-cell">Ship Via</th>
                  <th className="px-4 py-2 text-gray-400 font-medium hidden md:table-cell">Driver</th>
                  <th className="px-4 py-2 text-gray-400 font-medium hidden md:table-cell">Route</th>
                  <th className="px-4 py-2 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {detail.shipments.map((s, i) => (
                  <tr key={s.shipment_num ?? i} className="hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-mono text-gray-300">{s.shipment_num ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{fmt(s.invoice_date)}</td>
                    <td className="px-4 py-2.5 text-gray-400">{fmt(s.ship_date)}</td>
                    <td className="px-4 py-2.5 text-gray-400 hidden sm:table-cell">{s.ship_via || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 hidden md:table-cell">{s.driver || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 hidden md:table-cell">{s.route || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400">{s.status_flag || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attachments */}
      <ImagesSection soId={soId} />
    </div>
  );
}
