'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, ExternalLink } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type Customer = {
  cust_code: string;
  cust_name: string | null;
  branch_code: string | null;
  phone: string | null;
};

const BRANCHES = ['', '10FD', '20GR', '25BW', '40CV'];

export default function CustomersClient() {
  usePageTracking();
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (query: string, br: string) => {
    if (query.length < 2 && !br) {
      setCustomers([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sp = new URLSearchParams();
      if (query) sp.set('q', query);
      if (br) sp.set('branch', br);
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
    search(v, branch);
  }

  function handleBranchChange(v: string) {
    setBranch(v);
    search(q, v);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-cyan-400 mb-6">Customers</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="Search by name or code..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-sm"
          />
        </div>
        <select
          value={branch}
          onChange={(e) => handleBranchChange(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white"
        >
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b || 'All Branches'}</option>
          ))}
        </select>
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
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.cust_code} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-cyan-300 text-xs">{c.cust_code}</td>
                  <td className="px-4 py-3 text-white font-medium">{c.cust_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.branch_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/sales/customers/${encodeURIComponent(c.cust_code)}`}
                      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Profile <ExternalLink className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-600">{customers.length} customer{customers.length !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  );
}
