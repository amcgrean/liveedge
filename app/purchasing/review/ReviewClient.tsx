'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PoSubmission } from '../../../db/schema';

type Props = {
  submissions: PoSubmission[];
  statusFilter: string;
  branchFilter: string;
  days: number;
  isAdmin: boolean;
  availableBranches: string[];
};

const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  reviewed: 'bg-green-900/50 text-green-300 border-green-700',
  flagged:  'bg-red-900/50 text-red-300 border-red-700',
};

export default function ReviewClient({
  submissions,
  statusFilter,
  branchFilter,
  days,
  isAdmin,
  availableBranches,
}: Props) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [localSubs, setLocalSubs] = useState(submissions);

  function applyFilter(params: Record<string, string>) {
    const sp = new URLSearchParams({ status: statusFilter, branch: branchFilter, days: String(days), ...params });
    router.push(`/purchasing/review?${sp.toString()}`);
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try {
      const res = await fetch(`/api/purchasing/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = await res.json() as PoSubmission;
      setLocalSubs((prev) => prev.map((s) => s.id === id ? updated : s));
    } catch {
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-cyan-400">PO Submission Review</h1>
          <a href="/purchasing" className="text-sm text-cyan-400 hover:underline">+ New Check-In</a>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={statusFilter}
            onChange={(e) => applyFilter({ status: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="flagged">Flagged</option>
          </select>

          <select
            value={days}
            onChange={(e) => applyFilter({ days: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          >
            <option value="1">Last 24h</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>

          {isAdmin && availableBranches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => applyFilter({ branch: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
            >
              <option value="">All Branches</option>
              {availableBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}

          <span className="text-sm text-gray-500 self-center">{localSubs.length} submission{localSubs.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Submissions list */}
        {localSubs.length === 0 ? (
          <div className="text-center py-16 text-gray-600">No submissions found.</div>
        ) : (
          <div className="space-y-3">
            {localSubs.map((sub) => {
              const imageUrls = (sub.imageUrls as string[]) ?? [];
              const isExpanded = expanded === sub.id;

              return (
                <div
                  key={sub.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
                >
                  {/* Header row */}
                  <div className="flex items-start gap-4 p-4">
                    {/* Thumbnail */}
                    {imageUrls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrls[0]}
                        alt="Photo"
                        className="w-16 h-16 object-cover rounded border border-gray-700 shrink-0"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-cyan-300">{sub.poNumber}</span>
                          {sub.supplierName && (
                            <span className="ml-2 text-gray-300 text-sm">{sub.supplierName}</span>
                          )}
                          {sub.priority === 'high' && (
                            <span className="ml-2 text-xs bg-red-900/60 text-red-300 border border-red-700 rounded px-1.5 py-0.5">HIGH</span>
                          )}
                        </div>
                        <span className={`text-xs border rounded px-2 py-0.5 shrink-0 ${STATUS_COLORS[sub.status] ?? 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {sub.status}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>{sub.submittedUsername ?? sub.submittedBy}</span>
                        {sub.branch && <span>{sub.branch}</span>}
                        <span>{new Date(sub.createdAt!).toLocaleString()}</span>
                        <span>{imageUrls.length} photo{imageUrls.length !== 1 ? 's' : ''}</span>
                      </div>

                      {sub.notes && (
                        <p className="mt-1.5 text-sm text-gray-400 italic">{sub.notes}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : sub.id)}
                        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded"
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                      </button>
                      {sub.status !== 'reviewed' && (
                        <button
                          onClick={() => updateStatus(sub.id, 'reviewed')}
                          disabled={updating === sub.id}
                          className="text-xs bg-green-800 hover:bg-green-700 text-green-200 px-2 py-1 rounded disabled:opacity-50 transition-colors"
                        >
                          {updating === sub.id ? '...' : 'Mark Reviewed'}
                        </button>
                      )}
                      {sub.status !== 'flagged' && (
                        <button
                          onClick={() => updateStatus(sub.id, 'flagged')}
                          disabled={updating === sub.id}
                          className="text-xs bg-red-900 hover:bg-red-800 text-red-200 px-2 py-1 rounded disabled:opacity-50 transition-colors"
                        >
                          Flag
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded: all photos */}
                  {isExpanded && imageUrls.length > 1 && (
                    <div className="border-t border-gray-800 p-4">
                      <div className="grid grid-cols-4 gap-2">
                        {imageUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Photo ${i + 1}`}
                              className="w-full aspect-square object-cover rounded border border-gray-700 hover:border-cyan-600 transition-colors"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
