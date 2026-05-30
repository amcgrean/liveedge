'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ChecksView from '../../../../src/components/hubbell/ChecksView';

export default function ChecksPageClient() {
  return (
    <div className="text-slate-200">
      <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex items-center gap-1">
            <Link href="/admin" className="hover:text-slate-300">
              Admin
            </Link>
            <span className="text-slate-600">›</span>
            <Link href="/admin/hubbell" className="hover:text-slate-300">
              Hubbell
            </Link>
            <span className="text-slate-600">›</span>
            <span className="text-slate-300">Checks</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">Checks</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/hubbell"
            className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded text-xs inline-flex items-center gap-1.5"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to hub
          </Link>
        </div>
      </div>
      <div className="p-5 max-w-[1500px] mx-auto">
        <ChecksView minHeight={620} />
      </div>
    </div>
  );
}
