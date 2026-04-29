'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, User } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type Customer = {
  cust_code: string;
  cust_name: string | null;
  rep_1: string | null;
};

export default function CustomersClient() {
  usePageTracking();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomers([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      sp.set('q', query);
      const res = await fetch(`/api/sales/customers?${sp}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json() as { customers: Customer[] };
      setCustomers(data.customers);
      setSearched(true);
    } catch {
      setError('Search unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQChange(v: string) {
    setQ(v);
    search(v);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-cyan-400 mb-4 sm:mb-6">Customers</h1>

      <div className="mb-4 sm:mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full pl-9 pr-3 py-2.5 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-sm"
            autoFocus
          />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {!searched && !loading && (
        <p className="text-gray-500 text-sm">Type at least 2 characters to search customers.</p>
      )}

      {loading && <p className="text-gray-500 text-sm">Searching...</p>}

      {searched && !loading && customers.length === 0 && (
        <p className="text-gray-500 text-sm">No customers found.</p>
      )}

      {customers.length > 0 && (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {customers.map((c) => (
              <li key={c.cust_code}>
                <Link
                  href={`/sales/customers/${encodeURIComponent(c.cust_code)}`}
                  className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-cyan-600 hover:bg-gray-800/50 active:bg-gray-800 transition-colors"
                >
                  <div className="text-base sm:text-lg font-semibold text-white leading-tight">
                    {c.cust_name ?? '—'}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-cyan-300">{c.cust_code}</span>
                    {c.rep_1 && (
                      <span className="inline-flex items-center gap-1 text-gray-400">
                        <User className="w-3 h-3" />
                        {c.rep_1}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-gray-600">
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </div>
        </>
      )}
    </div>
  );
}
