'use client';

// This client component exists solely to wrap TakeoffWorkspace in a
// dynamic import with ssr:false. pdfjs-dist and fabric.js (imported
// transitively through TakeoffWorkspace → TakeoffCanvas) crash in Node.js,
// so we must prevent them from ever executing server-side.
import dynamic from 'next/dynamic';

const TakeoffWorkspace = dynamic(
  () => import('./TakeoffWorkspace').then((m) => m.TakeoffWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-400">Loading workspace…</span>
        </div>
      </div>
    ),
  }
);

export function TakeoffWorkspaceLoader({ sessionId }: { sessionId: string }) {
  return <TakeoffWorkspace sessionId={sessionId} />;
}
