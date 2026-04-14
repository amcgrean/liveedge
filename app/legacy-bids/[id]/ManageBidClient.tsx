'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from 'next-auth';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { usePageTracking } from '@/hooks/usePageTracking';
import {
  ArrowLeft,
  Calculator,
  Save,
  Trash2,
  CheckCircle,
  Clock,
  FileText,
  Ruler,
  Upload,
  X,
  ExternalLink,
  Send,
  FileCheck,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Package,
} from 'lucide-react';
import Link from 'next/link';

interface TakeoffSession {
  id: string;
  bidId?: string | null;
  name: string;
  updatedAt: string | null;
  measurements: Record<string, number> | null;
}

interface ShipTo {
  seqNum: number;
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
}

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
  // ERP integration fields (added via migration 0008)
  agilityQuoteId: string | null;
  agilitySoId: string | null;
  erpPushedAt: string | null;
  files: { id: number; filename: string; fileType: string | null; uploadedAt: string | null }[];
  activity: { id: number; action: string; timestamp: string }[];
  takeoffSession: TakeoffSession | null;
}

interface Props {
  session: Session;
}

export default function ManageBidClient({ session }: Props) {
  usePageTracking();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bidId = params.id as string;

  const [bid, setBid] = useState<BidDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [takeoffSessionId, setTakeoffSessionId] = useState<string | null>(null);
  const [startingTakeoff, setStartingTakeoff] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // ERP push state
  const [showErpForm, setShowErpForm] = useState(false);
  const [erpLoading, setErpLoading] = useState(false);
  const [erpError, setErpError] = useState('');
  const [erpSuccess, setErpSuccess] = useState('');
  const [erpShipTos, setErpShipTos] = useState<ShipTo[]>([]);
  const [erpShipTosLoaded, setErpShipTosLoaded] = useState(false);
  const [erpForm, setErpForm] = useState({
    mode: 'quote' as 'quote' | 'order',
    shipToSequence: 0,
    saleType: 'DELIVERY',
    expectDate: '',
    reference: '',
    notes: '',
  });

  // Editable form state
  const [form, setForm] = useState<Record<string, unknown>>({});

  const fetchBid = useCallback(async () => {
    setLoading(true);
    try {
      const bidRes = await fetch(`/api/legacy-bids/${bidId}`);
      if (!bidRes.ok) {
        setError('Bid not found');
        return;
      }
      const data = await bidRes.json();
      setBid(data);
      if (data.takeoffSession?.id) setTakeoffSessionId(data.takeoffSession.id);
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

  // Show success toast when redirected back after "Send to Estimate"
  useEffect(() => {
    const sent = searchParams.get('sent');
    if (sent !== null) {
      setSuccess(`Measurements sent — ${sent} field${sent === '1' ? '' : 's'} updated on the estimate.`);
      // Clean up the query param without re-navigating
      router.replace(`/legacy-bids/${bidId}`);
    }
  }, [searchParams, bidId, router]);

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

  const handleOpenErpForm = async () => {
    setErpError('');
    setErpSuccess('');
    setShowErpForm((v) => !v);
    if (!erpShipTosLoaded) {
      try {
        const res = await fetch(`/api/legacy-bids/${bidId}/ship-tos`);
        const data = await res.json();
        setErpShipTos(data.shipTos ?? []);
        if (data.shipTos?.length > 0) {
          setErpForm((f) => ({ ...f, shipToSequence: data.shipTos[0].seqNum }));
        }
      } catch {
        // silently continue — user can still type a sequence
      } finally {
        setErpShipTosLoaded(true);
      }
    }
  };

  const handlePromoteQuote = async () => {
    if (!confirm('Promote this quote to a Sales Order in Agility? This cannot be undone.')) return;
    setErpLoading(true);
    setErpError('');
    setErpSuccess('');
    try {
      const res = await fetch(`/api/legacy-bids/${bidId}/promote-quote`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErpError(data.error ?? 'Promotion failed');
        return;
      }
      setErpSuccess(data.message ?? 'Quote promoted to Sales Order');
      fetchBid();
    } catch {
      setErpError('Network error — could not reach server');
    } finally {
      setErpLoading(false);
    }
  };

  const handlePushToErp = async () => {
    setErpLoading(true);
    setErpError('');
    setErpSuccess('');
    try {
      const res = await fetch(`/api/legacy-bids/${bidId}/push-to-erp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(erpForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setErpError(data.error ?? 'Push failed');
        return;
      }
      setErpSuccess(data.message ?? 'Pushed to ERP successfully');
      setShowErpForm(false);
      fetchBid(); // refresh to show new QuoteID/SO ID
    } catch {
      setErpError('Network error — could not reach server');
    } finally {
      setErpLoading(false);
    }
  };

  const handleStartTakeoff = async () => {
    setStartingTakeoff(true);
    setError('');
    try {
      const res = await fetch(`/api/legacy-bids/${bidId}/start-takeoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to start takeoff'); return; }
      // data.pdfPreloaded tells us if the bid's PDF was auto-loaded into the session
      router.push(`/takeoff/${data.sessionId}`);
    } catch {
      setError('Network error');
    } finally {
      setStartingTakeoff(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    setError('');
    try {
      // Try presigned upload first
      const presignRes = await fetch(
        `/api/legacy-bids/${bidId}/files?action=presign&fileName=${encodeURIComponent(file.name)}`
      );
      if (presignRes.ok) {
        const { url, key } = await presignRes.json();
        const putRes = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (putRes.ok) {
          await fetch(`/api/legacy-bids/${bidId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, fileKey: key, fileType: file.type }),
          });
          fetchBid();
          return;
        }
      }
      // Fallback: proxy upload
      const form = new FormData();
      form.append('file', file);
      await fetch(`/api/legacy-bids/${bidId}/files`, { method: 'POST', body: form });
      fetchBid();
    } catch {
      setError('File upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Remove this file?')) return;
    await fetch(`/api/legacy-bids/${bidId}/files?fileId=${fileId}`, { method: 'DELETE' });
    fetchBid();
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
            {/* Takeoff Panel */}
            <div className="bg-gray-900 border border-cyan-900/40 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                PDF Takeoff
              </h3>

              {/* Plan PDF status */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Plan PDF</span>
                {bid.files.some(f => f.filename.toLowerCase().endsWith('.pdf')) ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <FileCheck className="w-3.5 h-3.5" />
                    {bid.files.find(f => f.filename.toLowerCase().endsWith('.pdf'))?.filename}
                  </span>
                ) : (
                  <span className="text-gray-500 italic">No PDF attached</span>
                )}
              </div>

              {/* CTA buttons */}
              {takeoffSessionId ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Link
                      href={`/takeoff/${takeoffSessionId}`}
                      className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Open Takeoff
                    </Link>
                    {bid.takeoffSession?.bidId ? (
                      <Link
                        href={`/estimating?bid=${bid.takeoffSession.bidId}`}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Calculator className="w-4 h-4" />
                        Open in Estimator
                      </Link>
                    ) : null}
                  </div>
                  <button
                    onClick={async () => {
                      if (!window.confirm('Push all measurement totals to the estimate?')) return;
                      const res = await fetch(`/api/takeoff/sessions/${takeoffSessionId}/send-to-estimate`, { method: 'POST' });
                      const data = await res.json();
                      if (res.ok) {
                        setSuccess(`Measurements sent — ${data.updatedFields?.length ?? 0} fields updated.`);
                        fetchBid();
                      } else {
                        setError(data.error ?? 'Failed to send');
                      }
                    }}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-cyan-300 rounded-lg text-sm transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Send to Estimate
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartTakeoff}
                  disabled={startingTakeoff}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-cyan-800 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Ruler className="w-4 h-4" />
                  {startingTakeoff ? 'Starting…' : 'Start Takeoff'}
                </button>
              )}

              {/* Measurements summary */}
              {bid.takeoffSession?.measurements && Object.keys(bid.takeoffSession.measurements).length > 0 && (
                <div className="pt-2 border-t border-gray-800 space-y-1">
                  {Object.entries(bid.takeoffSession.measurements).map(([key, val]) => {
                    const labels: Record<string, string> = {
                      basementExtLF: 'Basement Ext LF',
                      firstFloorExtLF: '1st Floor Ext LF',
                      secondFloorExtLF: '2nd Floor Ext LF',
                      roofSF: 'Roof SF',
                      sidingSF: 'Siding SF',
                      deckSF: 'Deck SF',
                      windowCount: 'Windows',
                      doorCount: 'Doors',
                    };
                    const isCount = key === 'windowCount' || key === 'doorCount';
                    return (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-400">{labels[key] ?? key}</span>
                        <span className="text-gray-200 font-medium tabular-nums">
                          {val.toLocaleString()} {isCount ? '' : key.endsWith('SF') ? 'sf' : 'lf'}
                        </span>
                      </div>
                    );
                  })}
                  {bid.takeoffSession.updatedAt && (
                    <p className="text-xs text-gray-600 pt-1">
                      Updated {new Date(bid.takeoffSession.updatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {bid.takeoffSession && (!bid.takeoffSession.measurements || Object.keys(bid.takeoffSession.measurements).length === 0) && (
                <p className="text-xs text-gray-500">No measurements yet — open takeoff to begin.</p>
              )}
            </div>

            {/* ERP Integration Panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  ERP Integration
                </h3>
                {(bid.agilityQuoteId || bid.agilitySoId) && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Pushed
                  </span>
                )}
              </div>

              {/* Current ERP status */}
              {bid.agilityQuoteId && (
                <div className="text-xs flex justify-between items-center py-1 border-t border-gray-800">
                  <span className="text-gray-400">Quote #</span>
                  <span className="font-mono text-amber-300">{bid.agilityQuoteId}</span>
                </div>
              )}
              {bid.agilitySoId && (
                <div className="text-xs flex justify-between items-center py-1 border-t border-gray-800">
                  <span className="text-gray-400">Sales Order #</span>
                  <span className="font-mono text-green-300">{bid.agilitySoId}</span>
                </div>
              )}

              {/* Promote Quote → SO button */}
              {bid.agilityQuoteId && !bid.agilitySoId && (
                <button
                  onClick={handlePromoteQuote}
                  disabled={erpLoading}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-green-900/40 hover:bg-green-900/60 disabled:opacity-50 text-green-300 border border-green-800/50 rounded-lg text-sm transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {erpLoading ? 'Promoting…' : 'Promote Quote → Sales Order'}
                </button>
              )}
              {bid.erpPushedAt && (
                <p className="text-xs text-gray-600">
                  Last pushed {new Date(bid.erpPushedAt).toLocaleString()}
                </p>
              )}

              {/* ERP push success/error */}
              {erpSuccess && (
                <div className="text-xs text-green-300 bg-green-900/30 border border-green-800 rounded p-2">
                  {erpSuccess}
                </div>
              )}
              {erpError && (
                <div className="text-xs text-red-300 bg-red-900/30 border border-red-800 rounded p-2 flex gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {erpError}
                </div>
              )}

              {/* Push button */}
              <button
                onClick={handleOpenErpForm}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-amber-900/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 rounded-lg text-sm transition-colors"
              >
                <Package className="w-4 h-4" />
                {bid.agilityQuoteId || bid.agilitySoId ? 'Re-push to ERP' : 'Push to ERP'}
                {showErpForm
                  ? <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                  : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
              </button>

              {/* Inline push form */}
              {showErpForm && (
                <div className="space-y-3 pt-1 border-t border-gray-800">
                  {/* Mode */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Create as</label>
                    <div className="flex gap-2">
                      {(['quote', 'order'] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setErpForm((f) => ({ ...f, mode: m }))}
                          className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                            erpForm.mode === m
                              ? 'bg-amber-700 text-white'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                          }`}
                        >
                          {m === 'quote' ? 'Quote' : 'Sales Order'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ship-to */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Ship-to</label>
                    {erpShipTos.length > 0 ? (
                      <select
                        value={erpForm.shipToSequence}
                        onChange={(e) => setErpForm((f) => ({ ...f, shipToSequence: parseInt(e.target.value, 10) }))}
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500"
                      >
                        {erpShipTos.map((st) => (
                          <option key={st.seqNum} value={st.seqNum}>
                            {st.seqNum} — {st.name || `${st.address1}, ${st.city}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={erpForm.shipToSequence || ''}
                        onChange={(e) => setErpForm((f) => ({ ...f, shipToSequence: parseInt(e.target.value, 10) || 0 }))}
                        placeholder="Ship-to sequence #"
                        className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500"
                      />
                    )}
                  </div>

                  {/* Sale type */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sale type</label>
                    <select
                      value={erpForm.saleType}
                      onChange={(e) => setErpForm((f) => ({ ...f, saleType: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500"
                    >
                      <option value="DELIVERY">Delivery</option>
                      <option value="WILLCALL">Will Call</option>
                      <option value="DIRECT">Direct Ship</option>
                    </select>
                  </div>

                  {/* Expect date */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      {erpForm.mode === 'quote' ? 'Quote expiry' : 'Delivery date'}
                    </label>
                    <input
                      type="date"
                      value={erpForm.expectDate}
                      onChange={(e) => setErpForm((f) => ({ ...f, expectDate: e.target.value }))}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Reference */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Reference / PO#</label>
                    <input
                      type="text"
                      value={erpForm.reference}
                      onChange={(e) => setErpForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder={bid.projectName}
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Notes</label>
                    <textarea
                      value={erpForm.notes}
                      onChange={(e) => setErpForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      placeholder="Optional order notes..."
                      className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  <button
                    onClick={handlePushToErp}
                    disabled={erpLoading || !erpForm.expectDate || !erpForm.shipToSequence}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Zap className="w-4 h-4" />
                    {erpLoading
                      ? 'Pushing…'
                      : `Create ${erpForm.mode === 'quote' ? 'Quote' : 'Sales Order'} in Agility`}
                  </button>
                </div>
              )}
            </div>

            {/* Files */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Attachments</h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded text-gray-300"
                >
                  <Upload className="w-3 h-3" />
                  {uploadingFile ? 'Uploading...' : 'Add File'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </div>
              {bid.files.length === 0 ? (
                <p className="text-sm text-gray-500">No files attached</p>
              ) : (
                <div className="space-y-2">
                  {bid.files.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-sm text-gray-300 group"
                    >
                      <FileText className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <button
                        className="truncate flex-1 text-left hover:text-cyan-400 transition-colors"
                        onClick={async () => {
                          const res = await fetch(`/api/legacy-bids/${bidId}/files?action=download&fileId=${f.id}`);
                          if (res.ok) {
                            const { url } = await res.json();
                            window.open(url, '_blank');
                          }
                        }}
                      >
                        {f.filename}
                      </button>
                      <button
                        onClick={() => handleDeleteFile(f.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
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
