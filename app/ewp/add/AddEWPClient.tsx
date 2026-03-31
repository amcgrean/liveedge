'use client';

import React, { useState, useEffect } from 'react';
import type { Session } from 'next-auth';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

interface Props { session: Session; }

export default function AddEWPClient({ session }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<{ id: number; customerCode: string; name: string }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [form, setForm] = useState({
    planNumber: '',
    customerId: 0,
    customerDisplay: '',
    address: '',
    tjiDepth: '',
    assignedDesigner: '',
    loginDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    fetch('/api/customers').then((r) => r.json()).then((d) => setCustomers(d.customers ?? [])).catch(() => {});
  }, []);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.customerCode.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.planNumber || !form.address || !form.tjiDepth) {
      setError('Plan Number, Customer, Address, and TJI Depth are required');
      return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/ewp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      router.push(`/ewp/${data.ewp.id}`);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  };

  const setField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ewp" className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold">New EWP</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Plan Number *</label>
              <input type="text" value={form.planNumber} onChange={(e) => setField('planNumber', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">TJI Depth *</label>
              <input type="text" value={form.tjiDepth} onChange={(e) => setField('tjiDepth', e.target.value)}
                placeholder='e.g. 9-1/2", 11-7/8"'
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1">Customer *</label>
            <input type="text" value={form.customerDisplay || customerSearch}
              onChange={(e) => { setCustomerSearch(e.target.value); setForm((f) => ({ ...f, customerDisplay: '', customerId: 0 })); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)} placeholder="Search customers..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                {filtered.slice(0, 20).map((c) => (
                  <button key={c.id} type="button" onClick={() => {
                    setForm((f) => ({ ...f, customerId: c.id, customerDisplay: `${c.customerCode} - ${c.name}` }));
                    setCustomerSearch(''); setShowDropdown(false);
                  }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800">
                    <span className="text-cyan-400">{c.customerCode}</span> <span className="text-gray-300">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Address *</label>
            <input type="text" value={form.address} onChange={(e) => setField('address', e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Assigned Designer</label>
              <input type="text" value={form.assignedDesigner} onChange={(e) => setField('assignedDesigner', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Login Date</label>
              <input type="date" value={form.loginDate} onChange={(e) => setField('loginDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500 resize-y" />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-medium">
              <Save className="w-4 h-4" /> {saving ? 'Creating...' : 'Create EWP'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
