'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, CheckCircle, Flag, FileText, Image, Clock, User } from 'lucide-react';

interface Submission {
  id: string;
  poNumber: string;
  imageUrls: string[];
  imageKeys: string[];
  supplierName: string | null;
  supplierKey: string | null;
  poStatus: string | null;
  submissionType: string;
  priority: string | null;
  notes: string | null;
  status: string;
  submittedBy: string;
  submittedUsername: string;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
  reviewerNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  reviewed: 'bg-green-500/20 text-green-300',
  flagged: 'bg-red-500/20 text-red-300',
};

interface Props { id: string; }

export default function ReviewDetailClient({ id }: Props) {
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/purchasing/submissions/${id}`);
        if (res.status === 404) { setError('Submission not found'); return; }
        if (!res.ok) { setError('Failed to load submission'); return; }
        const data = await res.json();
        setSub(data);
        setReviewerNotes(data.reviewerNotes ?? '');
      } catch {
        setError('Failed to load submission');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const updateStatus = async (status: string) => {
    if (!sub) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/purchasing/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_notes: reviewerNotes }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setSub(updated);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="p-6">
        <Link href="/purchasing/review" className="text-sm text-cyan-400 hover:underline">&larr; Review Queue</Link>
        <div className="mt-8 text-center text-slate-400">{error || 'Submission not found'}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <Link href="/purchasing/review" className="text-sm text-cyan-400 hover:underline">&larr; Review Queue</Link>
        <div className="flex items-start justify-between mt-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Submission #{sub.id}</h1>
            <p className="text-sm text-slate-400">PO {sub.poNumber} — {sub.supplierName ?? 'Unknown supplier'}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${STATUS_COLORS[sub.status] ?? 'bg-slate-700 text-slate-300'}`}>
            {sub.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Submitted by', value: sub.submittedUsername, icon: User },
          { label: 'Branch', value: sub.branch ?? '—', icon: FileText },
          { label: 'Submitted', value: new Date(sub.createdAt).toLocaleString(), icon: Clock },
          { label: 'Priority', value: sub.priority ?? 'Normal', icon: Flag },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-slate-900 border border-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
            <div className="text-sm font-semibold text-white truncate">{value}</div>
          </div>
        ))}
      </div>

      {/* Notes from submitter */}
      {sub.notes && (
        <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Submitter Notes</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{sub.notes}</p>
        </div>
      )}

      {/* Photos */}
      {sub.imageUrls.length > 0 && (
        <div className="bg-slate-900 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Image className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Photos ({sub.imageUrls.length})</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sub.imageUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(url)}
                className="aspect-square rounded-lg overflow-hidden bg-slate-800 border border-white/10 hover:border-cyan-500/50 transition"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reviewer section */}
      <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-white">Review</h2>

        {sub.reviewedBy && (
          <div className="text-xs text-slate-500">
            Last reviewed by <span className="text-slate-300">{sub.reviewedBy}</span>
            {sub.reviewedAt && <> at {new Date(sub.reviewedAt).toLocaleString()}</>}
          </div>
        )}

        <div>
          <label className="text-xs text-slate-400 block mb-1">Reviewer Notes</label>
          <textarea
            value={reviewerNotes}
            onChange={(e) => setReviewerNotes(e.target.value)}
            rows={3}
            placeholder="Add reviewer notes..."
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => updateStatus('reviewed')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : 'Mark Reviewed'}
          </button>
          <button
            onClick={() => updateStatus('flagged')}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            <Flag className="w-4 h-4" />
            Flag
          </button>
          {sub.status !== 'pending' && (
            <button
              onClick={() => updateStatus('pending')}
              disabled={saving}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition disabled:opacity-50"
            >
              Reset to Pending
            </button>
          )}
        </div>
      </div>

      {/* Full-size image modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setSelectedImage(null)}
        >
          <div className="max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage} alt="Full size" className="max-w-full max-h-full rounded-lg" />
            <button
              onClick={() => setSelectedImage(null)}
              className="mt-2 w-full text-center text-slate-400 hover:text-white text-sm transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
