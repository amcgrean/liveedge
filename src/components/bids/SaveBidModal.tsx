'use client';

import React, { useState } from 'react';
import { X, Save, CheckCircle } from 'lucide-react';
import { JobInputs, LineItem } from '../../types/estimate';

interface Props {
  open: boolean;
  onClose: () => void;
  inputs: JobInputs;
  lineItems: LineItem[];
  currentBidId?: string | null;
  currentBidNumber?: string | null;
  onSaved: (bidId: string, bidNumber: string) => void;
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

export function SaveBidModal({
  open,
  onClose,
  inputs,
  lineItems,
  currentBidId,
  currentBidNumber,
  onSaved,
}: Props) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedBidNumber, setSavedBidNumber] = useState('');

  const isUpdate = !!currentBidId;

  const handleSave = async () => {
    if (!inputs.setup.jobName.trim()) {
      setErrorMsg('Job Name is required before saving.');
      return;
    }
    if (!inputs.setup.estimatorName.trim()) {
      setErrorMsg('Estimator Name is required before saving.');
      return;
    }

    setStatus('saving');
    setErrorMsg('');

    try {
      const payload = {
        jobName: inputs.setup.jobName,
        customerCode: inputs.setup.customerCode,
        customerName: inputs.setup.customerName,
        estimatorName: inputs.setup.estimatorName,
        branch: inputs.setup.branch,
        inputs,
        lineItems,
        notes,
      };

      let res: Response;
      if (isUpdate && currentBidId) {
        res = await fetch(`/api/bids/${currentBidId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, changeNote: notes }),
        });
      } else {
        res = await fetch('/api/bids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const bidNumber = data.bid?.bidNumber ?? currentBidNumber ?? '';
      setSavedBidNumber(bidNumber);
      setStatus('success');
      onSaved(data.bid?.id ?? currentBidId ?? '', bidNumber);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save bid.');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    setErrorMsg('');
    setNotes('');
    setSavedBidNumber('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Save className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">
              {isUpdate ? 'Update Bid' : 'Save Bid'}
            </h2>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {status === 'success' ? (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-white mb-1">
                {isUpdate ? 'Bid Updated!' : 'Bid Saved!'}
              </p>
              {savedBidNumber && (
                <p className="text-slate-400 text-sm font-mono">{savedBidNumber}</p>
              )}
            </div>
          ) : (
            <>
              {/* Bid summary */}
              <div className="bg-slate-950/60 border border-slate-700 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Job Name</span>
                  <span className="text-white font-medium">{inputs.setup.jobName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer</span>
                  <span className="text-white">{inputs.setup.customerName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estimator</span>
                  <span className="text-white">{inputs.setup.estimatorName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Branch</span>
                  <span className="text-white capitalize">{inputs.setup.branch?.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-2">
                  <span className="text-slate-400">Line Items</span>
                  <span className="text-cyan-400 font-bold">{lineItems.length}</span>
                </div>
                {isUpdate && currentBidNumber && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bid #</span>
                    <span className="text-slate-300 font-mono text-xs">{currentBidNumber}</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {isUpdate ? 'Change note (optional)' : 'Notes (optional)'}
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isUpdate ? 'Describe what changed...' : 'Any notes about this bid...'}
                  className="w-full px-3 py-2 bg-slate-950/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none resize-none"
                />
              </div>

              {errorMsg && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  {errorMsg}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
            {status === 'success' ? 'Close' : 'Cancel'}
          </button>
          {status !== 'success' && (
            <button
              onClick={handleSave}
              disabled={status === 'saving'}
              className="px-5 py-2 rounded-lg text-sm font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition disabled:opacity-50 flex items-center gap-2"
            >
              {status === 'saving' ? (
                <>
                  <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isUpdate ? 'Update Bid' : 'Save Bid'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
