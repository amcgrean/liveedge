'use client';

import React, { useState, useEffect } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import { Plus } from 'lucide-react';
import LegacyBidsClient from '../legacy-bids/LegacyBidsClient';
import CompletedBidsClient from '../legacy-bids/completed/CompletedBidsClient';
import AllBidsClient from '../all-bids/AllBidsClient';
import BidsListClient from './BidsListClient';

type Tab = 'open' | 'completed' | 'all' | 'projects';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'open',       label: 'Open',       description: 'Active bid tracker entries' },
  { id: 'completed',  label: 'Completed',  description: 'Finished bids with turnaround' },
  { id: 'all',        label: 'All',        description: 'Tracker + Estimator unified' },
  { id: 'projects',   label: 'Projects',   description: 'Estimator bids with workflow' },
];

function isTab(v: string | null): v is Tab {
  return v === 'open' || v === 'completed' || v === 'all' || v === 'projects';
}

interface Props {
  session: Session;
  initialTab?: Tab;
}

export default function BidsHubClient({ session, initialTab = 'open' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const q = searchParams.get('tab');
    if (isTab(q) && q !== tab) setTab(q);
  }, [searchParams, tab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === 'open') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `/bids?${qs}` : '/bids', { scroll: false });
  };

  const userRole = (session.user as { role?: string }).role ?? 'estimator';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={userRole} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold">Bids</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {TABS.find((t) => t.id === tab)?.description}
            </p>
          </div>
          <Link
            href="/legacy-bids/add"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> New Bid
          </Link>
        </div>

        <div className="border-b border-gray-800 mb-6">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  tab === t.id
                    ? 'border-cyan-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'open' && <LegacyBidsClient session={session} embedded />}
        {tab === 'completed' && <CompletedBidsClient session={session} embedded />}
        {tab === 'all' && <AllBidsClient session={session} embedded />}
        {tab === 'projects' && <BidsListClient session={session} embedded />}
      </main>
    </div>
  );
}
