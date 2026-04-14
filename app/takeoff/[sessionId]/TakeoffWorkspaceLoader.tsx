'use client';

import { useEffect, useState } from 'react';
import type { TakeoffWorkspace as TakeoffWorkspaceType } from './TakeoffWorkspace';

// pdfjs-dist and fabric.js (loaded transitively through TakeoffWorkspace →
// TakeoffCanvas) touch browser-only globals. We import TakeoffWorkspace with
// a manual mount gate + client-side dynamic import so the server never
// executes that module, and the loading UI renders identically on server
// and on the first client render (avoiding React hydration mismatches
// that were previously surfacing from next/dynamic's Suspense boundary).

function LoadingUI() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">Loading workspace…</span>
      </div>
    </div>
  );
}

export function TakeoffWorkspaceLoader({ sessionId }: { sessionId: string }) {
  const [Component, setComponent] = useState<typeof TakeoffWorkspaceType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('./TakeoffWorkspace')
      .then((mod) => {
        if (!cancelled) setComponent(() => mod.TakeoffWorkspace);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <div className="font-medium mb-1">Failed to load takeoff workspace</div>
          <div className="text-red-200/90">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!Component) return <LoadingUI />;

  return <Component sessionId={sessionId} />;
}
