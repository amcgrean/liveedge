'use client';

import React, { useState, useEffect } from 'react';
import type { Session } from 'next-auth';
import { useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

interface CustomerOption {
  id: number;
  customerCode: string;
  name: string;
}

interface EstimatorOption {
  estimatorID: number;
  estimatorName: string;
}

interface Props {
  session: Session;
}

export default function AddBidClient({ session }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [estimators, setEstimators] = useState<EstimatorOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [form, setForm] = useState({
    planType: 'Residential',
    customerId: 0,
    customerDisplay: '',
    projectName: '',
    estimatorId: undefined as number | undefined,
    dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    flexibleBidDate: false,
    includeFraming: false,
    includeSiding: false,
    includeShingle: false,
    includeDeck: false,
    includeTrim: false,
    includeWindow: false,
    includeDoor: false,
    notes: '',
  });

  // Load customers and estimators
  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers ?? []))
      .catch(() => {});
    // TODO: Add estimators API endpoint when migrating estimator management
  }, []);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.customerCode.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.projectName) {
      setError('Customer and Project Name are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/legacy-bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create bid');
        return;
      }
      router.push(`/legacy-bids/${data.bid.id}`);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const setField = (field: string, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  const specToggles = [
    { key: 'includeFraming', label: 'Framing' },
    { key: 'includeSiding', label: 'Siding' },
    { key: 'includeShingle', label: 'Shingles' },
    { key: 'includeDeck', label: 'Deck' },
    { key: 'includeTrim', label: 'Trim' },
    { key: 'includeWindow', label: 'Windows' },
    { key: 'includeDoor', label: 'Doors' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/legacy-bids"
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">New Bid</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Plan Type */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Plan Type
            </label>
            <div className="flex gap-4">
              {['Residential', 'Commercial'].map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="planType"
                    value={t}
                    checked={form.planType === t}
                    onChange={() => setField('planType', t)}
                    className="accent-cyan-500"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Customer *
            </label>
            <input
              type="text"
              value={form.customerDisplay || customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setForm((f) => ({ ...f, customerDisplay: '', customerId: 0 }));
                setShowCustomerDropdown(true);
              }}
              onFocus={() => setShowCustomerDropdown(true)}
              placeholder="Search customers..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                {filteredCustomers.slice(0, 20).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        customerId: c.id,
                        customerDisplay: `${c.customerCode} - ${c.name}`,
                      }));
                      setCustomerSearch('');
                      setShowCustomerDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-cyan-400">{c.customerCode}</span>{' '}
                    <span className="text-gray-300">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Project Name *
            </label>
            <input
              type="text"
              value={form.projectName}
              onChange={(e) => setField('projectName', e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Due Date */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setField('dueDate', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.flexibleBidDate}
                onChange={(e) => setField('flexibleBidDate', e.target.checked)}
                className="accent-cyan-500"
              />
              <span className="text-sm text-gray-400">Flexible</span>
            </label>
          </div>

          {/* Spec Includes */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Include Specs
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {specToggles.map((s) => (
                <label
                  key={s.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                    (form as Record<string, unknown>)[s.key]
                      ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={(form as Record<string, unknown>)[s.key] as boolean}
                    onChange={(e) => setField(s.key, e.target.checked)}
                    className="accent-cyan-500"
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500 resize-y"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Creating...' : 'Create Bid'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
