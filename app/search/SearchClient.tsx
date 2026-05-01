'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, ShoppingCart, Users, Wrench, HardHat, Package, Loader2, X } from 'lucide-react';
import { TopNav } from '../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';

interface SearchResult {
  type: 'so' | 'customer' | 'work_order' | 'picker' | 'item';
  title: string;
  subtitle: string;
  url: string;
  meta?: string;
}

interface Props {
  userName: string | null;
  userRole?: string;
  initialQuery?: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  customer:   { label: 'Customer',     icon: <Users className="w-3.5 h-3.5" />,        color: 'text-green-400 bg-green-900/30 border-green-700' },
  item:       { label: 'Item',         icon: <Package className="w-3.5 h-3.5" />,      color: 'text-orange-400 bg-orange-900/30 border-orange-700' },
  so:         { label: 'Sales Order',  icon: <ShoppingCart className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-900/30 border-cyan-700' },
  work_order: { label: 'Work Order',   icon: <Wrench className="w-3.5 h-3.5" />,       color: 'text-yellow-400 bg-yellow-900/30 border-yellow-700' },
  picker:     { label: 'Picker',       icon: <HardHat className="w-3.5 h-3.5" />,      color: 'text-purple-400 bg-purple-900/30 border-purple-700' },
};

export default function SearchClient({ userName, userRole, initialQuery = '' }: Props) {
  usePageTracking();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery || searchParams.get('q') || '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(data.results ?? []);
      setSearched(true);
    } catch {
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
      // Push to URL without full reload so browser history works
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set('q', query.trim());
      } else {
        params.delete('q');
      }
      router.replace(`/search?${params}`, { scroll: false });
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus on mount, run initial search if query present
  useEffect(() => {
    inputRef.current?.focus();
    if (query.trim().length >= 2) doSearch(query);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  const typeOrder: SearchResult['type'][] = ['customer', 'item', 'so', 'work_order', 'picker'];

  return (
    <>
      <TopNav userName={userName} userRole={userRole} />
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Search bar hero */}
        <div className="bg-gray-900 border-b border-gray-800 py-8 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
                placeholder="Search orders, customers, items, work orders…"
                className="w-full pl-12 pr-10 py-3.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-base"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-gray-500 hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-2 pl-1">
              Searches customers, items, sales orders, work orders, and pickers
            </p>
          </div>
        </div>

        {/* Results */}
        <div className="max-w-2xl mx-auto px-4 py-6">
          {loading && (
            <div className="flex items-center gap-3 text-gray-400 py-8">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Searching…</span>
            </div>
          )}

          {error && !loading && (
            <div className="text-red-400 text-sm py-4">{error}</div>
          )}

          {!loading && searched && results.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-gray-600 text-sm mt-1">Try a different search term or check the spelling</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-6">
              <p className="text-xs text-gray-600">
                {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
              </p>

              {typeOrder.map((type) => {
                const group = grouped[type];
                if (!group?.length) return null;
                const cfg = TYPE_CONFIG[type];
                return (
                  <div key={type}>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 px-0.5 ${cfg.color.split(' ')[0]}`}>
                      {cfg.icon}
                      {cfg.label}s
                    </div>
                    <div className="space-y-1">
                      {group.map((r, i) => (
                        <Link
                          key={i}
                          href={r.url}
                          className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 hover:bg-gray-800/60 transition group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.color}`}>
                                {cfg.icon}
                                {cfg.label}
                              </span>
                              <span className="font-medium text-white group-hover:text-cyan-300 transition truncate">
                                {r.title}
                              </span>
                            </div>
                            <div className="text-sm text-gray-400 mt-0.5 truncate">{r.subtitle}</div>
                          </div>
                          {r.meta && (
                            <div className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0 mt-0.5">
                              {r.meta}
                            </div>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !searched && query.trim().length === 0 && (
            <div className="text-center py-12">
              <Search className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Start typing to search across the system</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {['SO 12345', 'Benson Lumber', 'WO 987', 'John Smith'].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => setQuery(hint)}
                    className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
