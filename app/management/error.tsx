'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ChevronLeft } from 'lucide-react';

export default function ManagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[management] render error:', error);
  }, [error]);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 mb-4"
      >
        <ChevronLeft className="w-3 h-3" /> Home
      </Link>
      <div className="bg-slate-800/60 border border-amber-700/50 rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl font-bold text-white">Management page failed to load</h1>
        </div>
        <p className="text-sm text-slate-300">
          One of the underlying queries threw. The error has been logged on the server.
        </p>
        {error.digest && (
          <p className="text-xs font-mono text-slate-500">digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-sm text-white"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    </div>
  );
}
