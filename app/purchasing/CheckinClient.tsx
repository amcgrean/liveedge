'use client';

import { useState, useRef } from 'react';
import { usePageTracking } from '@/hooks/usePageTracking';

type PoResult = {
  po_number: string;
  supplier_name: string | null;
  system_id: string | null;
  expect_date: string | null;
  po_status: string | null;
};

type PoDetail = {
  header: Record<string, unknown>;
  lines: Record<string, unknown>[];
  receiving_summary: Record<string, unknown> | null;
};

type LivePoLine = {
  sequence: number;
  item_code: string | null;
  description: string | null;
  qty_ordered: number | null;
  qty_received: number | null;
  uom: string | null;
};

type LivePoData = {
  header: Record<string, unknown>;
  lines: LivePoLine[];
  lineCount: number;
  totalQtyOrdered: number;
  totalQtyReceived: number;
  source: 'mirror' | 'live+mirror';
  liveError?: string;
};

type UploadedPhoto = { url: string; key: string };

type Step = 'search' | 'photos' | 'confirm' | 'done';

export default function CheckinClient() {
  usePageTracking();
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PoResult | null>(null);
  const [poDetail, setPoDetail] = useState<PoDetail | null>(null);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [liveData, setLiveData] = useState<LivePoData | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function search(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    setError('');
    try {
      const res = await fetch(`/api/purchasing/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Search failed');
      setSearchResults(await res.json());
    } catch { setError('Search unavailable'); }
    finally { setSearching(false); }
  }

  async function selectPo(po: PoResult) {
    setSelectedPo(po);
    setError('');
    setLiveData(null);

    // Load mirror table detail (non-critical)
    try {
      const res = await fetch(`/api/purchasing/pos/${encodeURIComponent(po.po_number)}`);
      if (res.ok) setPoDetail(await res.json());
    } catch { /* non-critical */ }

    // Load live ERP data in background (non-blocking)
    if (po.system_id) {
      setLoadingLive(true);
      try {
        const liveRes = await fetch(
          `/api/purchasing/pos/${encodeURIComponent(po.po_number)}/live?branch=${encodeURIComponent(po.system_id)}`
        );
        if (liveRes.ok) {
          const d = await liveRes.json() as LivePoData;
          setLiveData(d);
        }
      } catch { /* non-critical — degrade gracefully */ }
      finally { setLoadingLive(false); }
    }

    setStep('photos');
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('po_number', selectedPo?.po_number ?? 'unknown');
    try {
      const res = await fetch('/api/purchasing/photos', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json() as UploadedPhoto;
      setPhotos((p) => [...p, data]);
    } catch { setError('Photo upload failed. Try again.'); }
    finally { setUploading(false); }
  }

  async function submit() {
    if (!selectedPo) return;
    setSubmitting(true);
    setError('');
    try {
      const header = poDetail?.header as Record<string, string | null> | undefined;
      const res = await fetch('/api/purchasing/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          po_number: selectedPo.po_number,
          image_urls: photos.map((p) => p.url),
          image_keys: photos.map((p) => p.key),
          supplier_name: selectedPo.supplier_name,
          supplier_key: header?.supplier_key ?? null,
          po_status: selectedPo.po_status,
          priority: priority || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      const sub = await res.json() as { id: string };
      setSubmissionId(sub.id);
      setStep('done');
    } catch { setError('Submission failed. Please try again.'); }
    finally { setSubmitting(false); }
  }

  function reset() {
    setStep('search');
    setQuery('');
    setSearchResults([]);
    setSelectedPo(null);
    setPoDetail(null);
    setLiveData(null);
    setLoadingLive(false);
    setPhotos([]);
    setNotes('');
    setPriority('');
    setError('');
    setSubmissionId('');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-400 mb-6">PO Receiving Check-In</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Step indicators */}
        <div className="flex gap-2 mb-8 text-sm">
          {(['search', 'photos', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-gray-600">→</span>}
              <span className={step === s || (step === 'done' && s === 'confirm')
                ? 'text-cyan-400 font-semibold'
                : step === 'done' || (s === 'search' && step !== 'search') || (s === 'photos' && step === 'confirm')
                ? 'text-gray-400 line-through'
                : 'text-gray-600'
              }>
                {i + 1}. {s === 'search' ? 'Find PO' : s === 'photos' ? 'Photos' : 'Submit'}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Search */}
        {step === 'search' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">PO Number or Supplier</label>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
                placeholder="Search by PO number or supplier name..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                autoFocus
              />
            </div>

            {searching && <p className="text-sm text-gray-500">Searching...</p>}

            {searchResults.length > 0 && (
              <div className="border border-gray-700 rounded overflow-hidden">
                {searchResults.map((po) => (
                  <button
                    key={po.po_number}
                    onClick={() => selectPo(po)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-800 border-b border-gray-700 last:border-0 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-semibold text-cyan-300">{po.po_number}</span>
                        {po.supplier_name && (
                          <span className="ml-3 text-gray-300 text-sm">{po.supplier_name}</span>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0 ml-2">
                        {po.system_id && <div>{po.system_id}</div>}
                        {po.po_status && <div className="text-yellow-400">{po.po_status}</div>}
                      </div>
                    </div>
                    {po.expect_date && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Expected: {new Date(po.expect_date).toLocaleDateString()}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Photos */}
        {step === 'photos' && selectedPo && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded p-4 border border-gray-700">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono font-bold text-cyan-300 text-lg">{selectedPo.po_number}</div>
                  {selectedPo.supplier_name && (
                    <div className="text-gray-300 text-sm mt-0.5">{selectedPo.supplier_name}</div>
                  )}
                </div>
                <button
                  onClick={() => { setStep('search'); setSelectedPo(null); setPoDetail(null); }}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Change
                </button>
              </div>
              {poDetail?.header && (
                <div className="mt-3 text-xs text-gray-500 space-y-0.5">
                  {(poDetail.header as Record<string, string | null>).order_date && (
                    <div>Ordered: {new Date((poDetail.header as Record<string, string>).order_date).toLocaleDateString()}</div>
                  )}
                  {(poDetail.header as Record<string, string | null>).expect_date && (
                    <div>Expected: {new Date((poDetail.header as Record<string, string>).expect_date).toLocaleDateString()}</div>
                  )}
                  <div>Lines: {poDetail.lines.length}</div>
                </div>
              )}

              {/* Live ERP data panel */}
              {loadingLive && (
                <div className="mt-3 text-xs text-gray-500 animate-pulse">Loading live PO data…</div>
              )}
              {liveData && !loadingLive && (
                <div className="mt-3 border-t border-gray-700 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-300">Live ERP Status</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      liveData.source === 'live+mirror'
                        ? 'bg-green-900/50 text-green-400 border border-green-800'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}>
                      {liveData.source === 'live+mirror' ? 'Live' : 'Mirror'}
                    </span>
                  </div>

                  {/* Receipt progress bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Qty received vs ordered</span>
                      <span>{liveData.totalQtyReceived} / {liveData.totalQtyOrdered}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          liveData.totalQtyReceived >= liveData.totalQtyOrdered
                            ? 'bg-green-500'
                            : 'bg-amber-500'
                        }`}
                        style={{
                          width: `${Math.min(100, liveData.totalQtyOrdered > 0
                            ? (liveData.totalQtyReceived / liveData.totalQtyOrdered) * 100
                            : 0)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Line items table */}
                  {liveData.lines.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded border border-gray-700">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-gray-850">
                          <tr className="text-gray-500 border-b border-gray-700">
                            <th className="px-2 py-1 text-left font-medium">Item</th>
                            <th className="px-2 py-1 text-left font-medium">Description</th>
                            <th className="px-2 py-1 text-right font-medium">Ordered</th>
                            <th className="px-2 py-1 text-right font-medium">Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liveData.lines.map((line) => {
                            const ordered  = Number(line.qty_ordered ?? 0);
                            const received = Number(line.qty_received ?? 0);
                            const short    = received < ordered;
                            return (
                              <tr
                                key={line.sequence}
                                className={`border-b border-gray-800 ${short ? 'bg-amber-950/20' : ''}`}
                              >
                                <td className="px-2 py-1 font-mono text-cyan-400">{line.item_code ?? '—'}</td>
                                <td className="px-2 py-1 text-gray-400 max-w-[140px] truncate">{line.description ?? '—'}</td>
                                <td className="px-2 py-1 text-right text-gray-300 tabular-nums">
                                  {ordered} {line.uom ?? ''}
                                </td>
                                <td className={`px-2 py-1 text-right tabular-nums font-medium ${
                                  received >= ordered ? 'text-green-400' : 'text-amber-400'
                                }`}>
                                  {received}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {liveData.liveError && (
                    <p className="text-[10px] text-gray-600 italic">
                      Live API unavailable — showing mirror data
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Photos ({photos.length} attached)
              </label>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {photos.map((p, i) => (
                    <div key={p.key} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover rounded border border-gray-700"
                      />
                      <button
                        onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) { uploadPhoto(file); e.target.value = ''; }
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-gray-700 rounded py-6 text-gray-400 hover:border-cyan-700 hover:text-cyan-400 transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : photos.length === 0 ? '+ Add Photo' : '+ Add Another Photo'}
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('search')}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep('confirm')}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm + Notes */}
        {step === 'confirm' && selectedPo && (
          <div className="space-y-4">
            <div className="bg-gray-800 rounded p-4 border border-gray-700 space-y-2">
              <div className="font-mono font-bold text-cyan-300">{selectedPo.po_number}</div>
              {selectedPo.supplier_name && (
                <div className="text-gray-300 text-sm">{selectedPo.supplier_name}</div>
              )}
              <div className="text-xs text-gray-500">
                {photos.length} photo{photos.length !== 1 ? 's' : ''} attached
              </div>
              {liveData && (
                <div className="pt-2 border-t border-gray-700 text-xs space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>{liveData.lineCount} line{liveData.lineCount !== 1 ? 's' : ''}</span>
                    <span className={
                      liveData.totalQtyReceived >= liveData.totalQtyOrdered
                        ? 'text-green-400'
                        : 'text-amber-400'
                    }>
                      {liveData.totalQtyReceived} / {liveData.totalQtyOrdered} units received
                    </span>
                  </div>
                  {liveData.lines.some((l) => Number(l.qty_received ?? 0) < Number(l.qty_ordered ?? 0)) && (
                    <p className="text-amber-400/80 text-[10px]">
                      ⚠ Some lines short — note any discrepancies below
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              >
                <option value="">Normal</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this delivery..."
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep('photos')}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm"
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2 rounded transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Check-In'}
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl">✓</div>
            <h2 className="text-xl font-semibold text-green-400">Check-In Submitted</h2>
            <p className="text-gray-400 text-sm">
              PO {selectedPo?.po_number} — {photos.length} photo{photos.length !== 1 ? 's' : ''}
            </p>
            {submissionId && (
              <p className="text-xs text-gray-600 font-mono">ID: {submissionId}</p>
            )}
            <button
              onClick={reset}
              className="mt-6 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-semibold transition-colors"
            >
              New Check-In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
