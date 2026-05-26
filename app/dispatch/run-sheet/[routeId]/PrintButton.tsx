'use client';

export function PrintButton({ routeName }: { routeName: string }) {
  return (
    <div className="no-print flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
      <span className="text-sm text-gray-500">Run Sheet — {routeName}</span>
      <button
        onClick={() => window.print()}
        className="px-4 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-700 transition-colors"
      >
        Print / Save PDF
      </button>
    </div>
  );
}
