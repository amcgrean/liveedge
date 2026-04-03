'use client';

import { useState } from 'react';
import { Search, FileImage, Mail, Calendar, ExternalLink, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type CreditImage = {
  id: number; rma_number: string; filename: string; filepath: string;
  email_from: string | null; email_subject: string | null;
  received_at: string | null; uploaded_at: string | null;
  r2_key: string | null;
};

type CreditGroup = {
  rma_number: string;
  images: CreditImage[];
};

function isImageFile(filename: string, contentType?: string): boolean {
  if (contentType?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(filename);
}

function ViewButton({ imageId, filename }: { imageId: number; filename: string }) {
  const [loading, setLoading] = useState(false);

  async function openImage() {
    setLoading(true);
    try {
      const res = await fetch(`/api/credits/${imageId}/image`);
      if (!res.ok) throw new Error('Failed');
      const { url } = await res.json() as { url: string };
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      alert('Could not load image. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const isImg = isImageFile(filename);

  return (
    <button
      onClick={openImage}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-700/50 text-cyan-300 rounded transition-colors disabled:opacity-50 shrink-0"
      title={`View ${filename}`}
    >
      {loading
        ? <Loader2 className="w-3 h-3 animate-spin" />
        : isImg
        ? <ImageIcon className="w-3 h-3" />
        : <FileText className="w-3 h-3" />}
      {loading ? 'Loading…' : 'View'}
    </button>
  );
}

export default function CreditsClient() {
  usePageTracking();
  const [q, setQ] = useState('');
  const [credits, setCredits] = useState<CreditGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function search(query: string) {
    if (query.length < 2) { setCredits([]); setSearched(false); return; }
    setLoading(true);
    setError('');
    try {
      const isRma = /^\d+/.test(query) || /^rma/i.test(query);
      const sp = new URLSearchParams();
      if (isRma) {
        sp.set('rma', query.replace(/^rma/i, '').trim());
      } else {
        sp.set('q', query);
      }
      const res = await fetch(`/api/credits?${sp}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json() as { credits: CreditGroup[]; total: number };
      setCredits(data.credits);
      setSearched(true);
    } catch {
      setError('Search unavailable');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    search(q);
  }

  const totalImages = credits.reduce((sum, g) => sum + g.images.length, 0);
  const withR2 = credits.reduce((sum, g) => sum + g.images.filter((i) => i.r2_key).length, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cyan-400">RMA Credits</h1>
        <p className="text-sm text-gray-500 mt-1">Search credit and RMA image records from email submissions.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.length === 0) { setCredits([]); setSearched(false); }
            }}
            placeholder="RMA number or supplier email..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-sm"
            autoFocus
          />
        </div>
        <button
          type="submit"
          disabled={loading || q.length < 2}
          className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {!searched && !loading && (
        <p className="text-gray-500 text-sm">Enter an RMA number or email to search credit images.</p>
      )}
      {searched && !loading && credits.length === 0 && (
        <p className="text-gray-500 text-sm">No credit images found for &ldquo;{q}&rdquo;.</p>
      )}

      {searched && credits.length > 0 && (
        <div className="flex items-center gap-3 mb-4 text-xs text-gray-500">
          <span><span className="text-white font-medium">{credits.length}</span> RMA{credits.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span><span className="text-white font-medium">{totalImages}</span> image{totalImages !== 1 ? 's' : ''}</span>
          {withR2 < totalImages && (
            <>
              <span>·</span>
              <span className="text-yellow-500">{totalImages - withR2} legacy (no preview)</span>
            </>
          )}
        </div>
      )}

      {credits.length > 0 && (
        <div className="space-y-4">
          {credits.map((group) => {
            const hasAnyR2 = group.images.some((i) => i.r2_key);
            return (
              <div key={group.rma_number} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                  <div className="flex items-center gap-3">
                    <FileImage className="w-5 h-5 text-cyan-400" />
                    <span className="font-mono font-bold text-cyan-300">{group.rma_number}</span>
                    {!hasAnyR2 && (
                      <span className="text-xs text-yellow-600 bg-yellow-900/30 border border-yellow-800/50 rounded px-2 py-0.5">
                        Legacy — no preview
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {group.images.length} file{group.images.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-gray-800">
                  {group.images.map((img) => (
                    <div key={img.id} className="px-5 py-3 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {isImageFile(img.filename)
                              ? <ImageIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                              : <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                            <span className="text-gray-300 font-medium truncate">{img.filename}</span>
                          </div>
                          {img.email_from && (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{img.email_from}</span>
                            </div>
                          )}
                          {img.email_subject && (
                            <div className="text-xs text-gray-600 truncate">{img.email_subject}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <Calendar className="w-3 h-3" />
                            {img.received_at
                              ? new Date(img.received_at).toLocaleString(undefined, {
                                  dateStyle: 'short', timeStyle: 'short',
                                })
                              : '—'}
                          </div>
                          {img.r2_key ? (
                            <ViewButton imageId={img.id} filename={img.filename} />
                          ) : (
                            <span className="text-xs text-gray-700 px-2.5 py-1 border border-gray-800 rounded">
                              No preview
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
