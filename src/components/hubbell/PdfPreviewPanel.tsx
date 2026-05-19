'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, ExternalLink, RefreshCw } from 'lucide-react';

// Slide-out side panel that shows the PDF for a single hubbell document via
// the existing presigned-URL endpoint. Pass `documentId={null}` to close.
// The presigned URL expires after 5 min, so we refetch on Esc/open.
export default function PdfPreviewPanel({
  documentId,
  docNumber,
  onClose,
}: {
  documentId: string | null;
  docNumber?: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    fetch(`/api/admin/hubbell/documents/${documentId}/pdf`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setError(json.error ?? `HTTP ${r.status}`);
          return;
        }
        setUrl(json.url ?? null);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [documentId]);

  useEffect(() => {
    if (!documentId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [documentId, onClose]);

  if (!documentId) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[55vw] lg:w-[50vw] xl:w-[45vw] bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <div className="text-sm">
          <span className="text-slate-500">PDF:</span>{' '}
          <span className="font-mono text-slate-200">{docNumber ?? documentId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/hubbell/${documentId}`}
            className="px-2 py-1 text-xs text-slate-300 hover:text-slate-100 inline-flex items-center gap-1"
            title="Open document detail"
          >
            Detail <ExternalLink className="w-3 h-3" />
          </Link>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-xs text-slate-300 hover:text-slate-100 inline-flex items-center gap-1"
              title="Open in new tab"
            >
              New tab <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            onClick={onClose}
            className="px-2 py-1 text-slate-400 hover:text-slate-100"
            aria-label="Close PDF preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 bg-slate-900">
        {loading && (
          <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading PDF…
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-400">{error}</div>
        )}
        {url && (
          <iframe
            key={url}
            src={url}
            title="PDF preview"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
