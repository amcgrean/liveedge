'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search, ChevronLeft, ChevronRight, Loader2, Paperclip, FileText,
  ExternalLink, ChevronDown, ChevronUp, Mail, Upload, ArrowUpDown,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { CreditMemo, SortCol } from './types';
import type { CreditImage } from '../api/credits/[id]/images/route';

type SortDir = 'asc' | 'desc';

type ApiResponse = {
  credits: CreditMemo[];
  total: number;
  page: number;
  limit: number;
  sort: SortCol;
  dir: SortDir;
};

type ImagesResponse = { images: CreditImage[] };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, { dateStyle: 'short' });
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

function ImagesPanel({ soId, onUploaded }: { soId: string; onUploaded: () => void }) {
  const [images, setImages] = useState<CreditImage[] | null>(null);
  const [error, setError] = useState('');
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
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
    if (!e.target) return;
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Only PDF, JPG, PNG, GIF, and WebP files are allowed.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      // Step 1: get presigned PUT URL
      const sp = new URLSearchParams({ filename: file.name, content_type: file.type });
      const presignRes = await fetch(`/api/credits/${soId}/upload?${sp}`);
      if (!presignRes.ok) throw new Error('Could not get upload URL');
      const { upload_url, r2_key } = await presignRes.json() as { upload_url: string; r2_key: string };

      // Step 2: PUT directly to R2
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putRes.ok) throw new Error('Upload to storage failed');

      // Step 3: confirm — write credit_images row
      const confirmRes = await fetch(`/api/credits/${soId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, r2_key, content_type: file.type }),
      });
      if (!confirmRes.ok) throw new Error('Could not save record');

      loadImages();
      onUploaded();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Upload button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded transition-colors"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Uploading…' : 'Upload Document'}
        </button>
        <span className="text-xs text-gray-600">PDF, JPG, PNG — uploaded directly, no email needed</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>
      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

      {/* Image list */}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && !images && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
      {!error && images?.length === 0 && (
        <p className="text-xs text-gray-500">No attachments on record. Use the button above to upload.</p>
      )}
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
              {viewingId === img.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <ExternalLink className="w-3 h-3" />}
              View
            </button>
          ) : (
            <span className="text-xs text-gray-600 shrink-0">No file</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SortableHeader({
  col, label, activeCol, activeDir, onSort, className = '',
}: {
  col: SortCol; label: string; activeCol: SortCol; activeDir: SortDir;
  onSort: (col: SortCol) => void; className?: string;
}) {
  const active = activeCol === col;
  const Icon = active ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-200 transition-colors ${className}`}
    >
      <span className="flex items-center gap-1.5">
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-cyan-400' : 'opacity-40'}`} />
      </span>
    </th>
  );
}

export default function CreditsClient() {
  usePageTracking();

  const [q, setQ]               = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [credits, setCredits]   = useState<CreditMemo[]>([]);
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortCol, setSortCol]   = useState<SortCol>('created_date');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [expandedSoId, setExpandedSoId] = useState<string | null>(null);
  // Track doc counts locally so the Docs column updates after an upload without a full reload
  const [docCountOverrides, setDocCountOverrides] = useState<Record<string, number>>({});

  const load = useCallback(async (p: number, query: string, col: SortCol, dir: SortDir) => {
    setLoading(true);
    setError('');
    setExpandedSoId(null);
    setDocCountOverrides({});
    try {
      const sp = new URLSearchParams({ page: String(p), sort: col, dir });
      if (query) sp.set('q', query);
      const res = await fetch(`/api/credits?${sp}`);
      if (!res.ok) throw new Error();
      const data = await res.json() as ApiResponse;
      setCredits(data.credits);
      setPage(data.page);
      setTotal(data.total);
      setTotalPages(Math.ceil(data.total / data.limit));
    } catch {
      setError('Could not load credits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, '', 'created_date', 'desc'); }, [load]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(1, q, sortCol, sortDir);
  }

  function clearSearch() {
    setQ('');
    load(1, '', sortCol, sortDir);
  }

  function handleSort(col: SortCol) {
    const newDir: SortDir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc';
    setSortCol(col);
    setSortDir(newDir);
    load(1, q, col, newDir);
  }

  function toggleImages(soId: string) {
    setExpandedSoId((prev) => (prev === soId ? null : soId));
  }

  function handleUploaded(soId: string, currentCount: number) {
    setDocCountOverrides((prev) => ({ ...prev, [soId]: (prev[soId] ?? currentCount) + 1 }));
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cyan-400">RMA Credits</h1>
        <p className="text-sm text-gray-500 mt-1">
          Open credit memos from ERP — not yet invoiced, filtered by your branch.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value) clearSearch(); }}
            placeholder="CM #, customer, reference, PO #…"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
        >
          {loading ? 'Loading…' : 'Search'}
        </button>
        {q && (
          <button
            type="button"
            onClick={clearSearch}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          {loading ? 'Loading…' : `${total} open credit memo${total !== 1 ? 's' : ''}${q ? ` matching "${q}"` : ''}`}
        </p>
        {!loading && totalPages > 1 && (
          <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800 text-left">
              <SortableHeader col="so_id"        label="CM #"           activeCol={sortCol} activeDir={sortDir} onSort={handleSort} />
              <SortableHeader col="cust_name"    label="Customer"       activeCol={sortCol} activeDir={sortDir} onSort={handleSort} />
              <SortableHeader col="reference"    label="Reference / PO" activeCol={sortCol} activeDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />
              <SortableHeader col="city"         label="Location"       activeCol={sortCol} activeDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
              <SortableHeader col="so_status"    label="Status"         activeCol={sortCol} activeDir={sortDir} onSort={handleSort} />
              <SortableHeader col="system_id"    label="Branch"         activeCol={sortCol} activeDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortableHeader col="doc_count"    label="Docs"           activeCol={sortCol} activeDir={sortDir} onSort={handleSort} />
              <SortableHeader col="created_date" label="Created"        activeCol={sortCol} activeDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-500" />
                </td>
              </tr>
            )}
            {!loading && credits.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                  No open credit memos found.
                </td>
              </tr>
            )}
            {!loading && credits.map((cm) => {
              const docCount = docCountOverrides[cm.so_id] ?? cm.doc_count;
              return (
                <>
                  <tr key={cm.so_id} className={`hover:bg-gray-900/50 transition-colors ${expandedSoId === cm.so_id ? 'bg-gray-900/40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-cyan-400 font-medium whitespace-nowrap">
                      <Link href={`/credits/${cm.so_id}`} className="hover:underline">
                        {cm.so_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="truncate text-gray-200">{cm.cust_name ?? '—'}</div>
                      {cm.cust_code && <div className="text-xs text-gray-500">{cm.cust_code}</div>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]">
                      <div className="truncate text-gray-400 text-xs">{cm.reference ?? '—'}</div>
                      {cm.po_number && <div className="text-xs text-gray-600 truncate">PO: {cm.po_number}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell max-w-[160px]">
                      <div className="truncate text-gray-400 text-xs">
                        {[cm.address_1, cm.city].filter(Boolean).join(', ') || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={cm.so_status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-gray-400">
                      {cm.system_id ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleImages(cm.so_id)}
                        className={`flex items-center gap-1 transition-colors ${
                          docCount > 0
                            ? 'text-cyan-400 hover:text-cyan-300'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                        title={docCount > 0 ? 'View / upload attachments' : 'Upload attachment'}
                      >
                        {docCount > 0
                          ? <Paperclip className="w-3.5 h-3.5" />
                          : <FileText className="w-3.5 h-3.5" />}
                        <span className="text-sm font-medium">{docCount > 0 ? docCount : 'None'}</span>
                        {expandedSoId === cm.so_id
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                      {fmt(cm.created_date)}
                    </td>
                  </tr>
                  {expandedSoId === cm.so_id && (
                    <tr key={`${cm.so_id}-images`}>
                      <td colSpan={8} className="px-6 py-3 bg-gray-900/60 border-t border-gray-800/50">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
                          Attachments for CM {cm.so_id}
                        </p>
                        <ImagesPanel
                          soId={cm.so_id}
                          onUploaded={() => handleUploaded(cm.so_id, cm.doc_count)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => load(page - 1, q, sortCol, sortDir)}
            disabled={page <= 1}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => load(page + 1, q, sortCol, sortDir)}
            disabled={page >= totalPages}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
