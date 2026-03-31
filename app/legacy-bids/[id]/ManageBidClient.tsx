'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from 'next-auth';
import { useParams, useRouter } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import {
  ArrowLeft,
  Save,
  Trash2,
  CheckCircle,
  Clock,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

interface BidDetail {
  id: number;
  planType: string;
  projectName: string;
  customerId: number;
  salesRepId: number | null;
  estimatorId: number | null;
  status: string;
  logDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  bidDate: string | null;
  flexibleBidDate: boolean | null;
  includeSpecs: boolean | null;
  includeFraming: boolean | null;
  includeSiding: boolean | null;
  includeShingle: boolean | null;
  includeDeck: boolean | null;
  includeTrim: boolean | null;
  includeWindow: boolean | null;
  includeDoor: boolean | null;
  framingNotes: string | null;
  sidingNotes: string | null;
  deckNotes: string | null;
  trimNotes: string | null;
  windowNotes: string | null;
  doorNotes: string | null;
  shingleNotes: string | null;
  notes: string | null;
  lastUpdatedBy: string | null;
  lastUpdatedAt: string | null;
  customerName: string | null;
  customerCode: string | null;
  estimatorName: string | null;
  files: { id: number; filename: string; fileType: string | null; uploadedAt: string | null }[];
  activity: { id: number; action: string; timestamp: string }[];
}

interface Props {
  session: Session;
}

export default function ManageBidClient({ session }: Props) {
  const params = useParams();
  const router = useRouter();
  const bidId = params.id as string;

  const [bid, setBid] = useState<BidDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Editable form state
  const [form, setForm] = useState<Record<string, unknown>>({});

  const fetchBid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/legacy-bids/${bidId}`);
      if (!res.ok) {
        setError('Bid not found');
        return;
      }
      const data = await res.json();
      setBid(data);
      // Initialize form from bid data
      setForm({
        projectName: data.projectName,
        status: data.status,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : '',
        bidDate: data.bidDate ? new Date(data.bidDate).toISOString().split('T')[0] : '',
        flexibleBidDate: data.flexibleBidDate ?? false,
        includeFraming: data.includeFraming ?? false,
        includeSiding: data.includeSiding ?? false,
        includeShingle: data.includeShingle ?? false,
        includeDeck: data.includeDeck ?? false,
        includeTrim: data.includeTrim ?? false,
        includeWindow: data.includeWindow ?? false,
        includeDoor: data.includeDoor ?? false,
        framingNotes: data.framingNotes ?? '',
        sidingNotes: data.sidingNotes ?? '',
        deckNotes: data.deckNotes ?? '',
        trimNotes: data.trimNotes ?? '',
        windowNotes: data.windowNotes ?? '',
        doorNotes: data.doorNotes ?? '',
        shingleNotes: data.shingleNotes ?? '',
        notes: data.notes ?? '',
      });
    } catch {
      setError('Failed to load bid');
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => {
    fetchBid();
  }, [fetchBid]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/legacy-bids/${bidId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to save');
        return;
      }
      setSuccess('Bid saved successfully');
      fetchBid();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setForm((f) => ({ ...f, status: 'Complete' }));
    setSaving(true);
    try {
      await fetch(`/api/legacy-bids/${bidId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status: 'Complete' }),
      });
      setSuccess('Bid marked as complete');
      fetchBid();
    } catch {
      setError('Failed to complete bid');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this bid? This cannot be undone.')) return;
    try {
      await fetch(`/api/legacy-bids/${bidId}`, { method: 'DELETE' });
      router.push('/legacy-bids');
    } catch {
      setError('Failed to delete');
    }
  };

  const setField = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const specSections = [
    { key: 'includeFraming', notesKey: 'framingNotes', label: 'Framing' },
    { key: 'includeSiding', notesKey: 'sidingNotes', label: 'Siding' },
    { key: 'includeShingle', notesKey: 'shingleNotes', label: 'Shingles' },
    { key: 'includeDeck', notesKey: 'deckNotes', label: 'Deck' },
    { key: 'includeTrim', notesKey: 'trimNotes', label: 'Trim' },
    { key: 'includeWindow', notesKey: 'windowNotes', label: 'Windows' },
    { key: 'includeDoor', notesKey: 'doorNotes', label: 'Doors' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav userName={session.user?.name} userRole={session.user?.role} />
        <div className="max-w-4xl mx-auto px-4 py-8 text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <TopNav userName={session.user?.name} userRole={session.user?.role} />
        <div className="max-w-4xl mx-auto px-4 py-8 text-red-400">{error || 'Bid not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/legacy-bids" className="p-2 rounded-lg hover:bg-gray-800">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">{bid.projectName}</h1>
              <p className="text-sm text-gray-400">
                {bid.customerCode} — {bid.customerName} | {bid.planType} |{' '}
                Estimator: {bid.estimatorName ?? 'Unassigned'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {bid.status !== 'Complete' && (
              <button
                onClick={handleComplete}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm"
              >
                <CheckCircle className="w-4 h-4" />
                Complete
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded-lg text-sm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300 text-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dates & Status */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Details
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={(form.projectName as string) ?? ''}
                    onChange={(e) => setField('projectName', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Status</label>
                  <select
                    value={(form.status as string) ?? 'Incomplete'}
                    onChange={(e) => setField('status', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Incomplete">Incomplete</option>
                    <option value="Complete">Complete</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={(form.dueDate as string) ?? ''}
                    onChange={(e) => setField('dueDate', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Bid Date</label>
                  <input
                    type="date"
                    value={(form.bidDate as string) ?? ''}
                    onChange={(e) => setField('bidDate', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Logged: {bid.logDate ? new Date(bid.logDate).toLocaleDateString() : '—'} |{' '}
                Last updated: {bid.lastUpdatedBy ?? '—'}{' '}
                {bid.lastUpdatedAt ? new Date(bid.lastUpdatedAt).toLocaleString() : ''}
              </div>
            </div>

            {/* Spec Sections */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Specifications
              </h2>
              <div className="space-y-3">
                {specSections.map((s) => (
                  <div key={s.key} className="border border-gray-800 rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(form[s.key] as boolean) ?? false}
                        onChange={(e) => setField(s.key, e.target.checked)}
                        className="accent-cyan-500"
                      />
                      <span className="font-medium text-sm">{s.label}</span>
                    </label>
                    {Boolean(form[s.key]) && (
                      <textarea
                        value={(form[s.notesKey] as string) ?? ''}
                        onChange={(e) => setField(s.notesKey, e.target.value)}
                        placeholder={`${s.label} notes...`}
                        rows={2}
                        className="mt-2 w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500 resize-y"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* General Notes */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-400 mb-2">
                General Notes
              </label>
              <textarea
                value={(form.notes as string) ?? ''}
                onChange={(e) => setField('notes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-cyan-500 resize-y"
              />
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Files */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">Attachments</h3>
              {bid.files.length === 0 ? (
                <p className="text-sm text-gray-500">No files attached</p>
              ) : (
                <div className="space-y-2">
                  {bid.files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-sm text-gray-300"
                    >
                      <FileText className="w-3 h-3 text-gray-500" />
                      <span className="truncate">{f.filename}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3">Activity</h3>
              {bid.activity.length === 0 ? (
                <p className="text-sm text-gray-500">No activity</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {bid.activity.map((a) => (
                    <div key={a.id} className="text-xs text-gray-400">
                      <span className="text-gray-300">{a.action}</span>{' '}
                      {new Date(a.timestamp).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
