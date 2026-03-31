'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-4 text-center">
        <div className="text-4xl mb-4">⚠</div>
        <h2 className="text-lg font-bold text-white mb-2">Failed to load</h2>
        <p className="text-gray-400 text-sm mb-6">{error.message ?? 'An error occurred. Please try again.'}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={reset} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium">
            Retry
          </button>
          <Link href="/dashboard" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
