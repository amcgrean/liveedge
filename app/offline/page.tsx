import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline · Beisser LiveEdge',
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[#040f07] text-white">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-white/70">
          LiveEdge needs a network connection to load live ERP, dispatch, and sales data.
          Reconnect to pick up where you left off.
        </p>
        <p className="text-xs text-white/50">
          This page will refresh automatically when you&apos;re back online.
        </p>
      </div>
    </main>
  );
}
