'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProjectRow {
  id: number;
  contractor: string;
  projectAddress: string;
  contractorPhone: string | null;
  contractorEmail: string | null;
  includeFraming: boolean;
  includeSiding: boolean;
  includeShingles: boolean;
  includeDeck: boolean;
  includeDoors: boolean;
  includeWindows: boolean;
  includeTrim: boolean;
  notes: string | null;
  createdAt: string | null;
  customerName: string | null;
  salesRepName: string | null;
}

interface Props { session: Session; }

export default function ProjectsClient({ session }: Props) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (search) params.set('q', search);
    try {
      const res = await fetch(`/api/projects?${params}`);
      const data = await res.json();
      setProjects(data.projects ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const totalPages = Math.ceil(total / limit);

  const specBadges = (p: ProjectRow) => {
    const specs = [
      p.includeFraming && 'Framing',
      p.includeSiding && 'Siding',
      p.includeShingles && 'Shingles',
      p.includeDeck && 'Deck',
      p.includeDoors && 'Doors',
      p.includeWindows && 'Windows',
      p.includeTrim && 'Trim',
    ].filter(Boolean);
    return specs.length > 0 ? specs.join(', ') : '—';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Projects</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search projects..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <button onClick={fetchProjects} className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">Contractor</th>
                <th className="px-4 py-3 text-left font-medium">Address</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Sales Rep</th>
                <th className="px-4 py-3 text-left font-medium">Includes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : projects.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No projects found</td></tr>
              ) : projects.map((p) => (
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="text-cyan-400 hover:text-cyan-300 font-medium">{p.contractor}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.projectAddress}</td>
                  <td className="px-4 py-3 text-gray-300">{p.customerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{p.salesRepName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{specBadges(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>{page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
