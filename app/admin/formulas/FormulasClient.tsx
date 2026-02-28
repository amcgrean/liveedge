'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Save, RefreshCw, AlertCircle, Info } from 'lucide-react';

interface Multiplier {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string | null;
  isEditable: boolean;
  updatedAt: string;
}

export default function FormulasClient() {
  const [multipliers, setMultipliers] = useState<Multiplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/multipliers');
      if (res.ok) {
        const data = await res.json();
        setMultipliers(data.multipliers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleChange = (id: string, value: string) => {
    setEdited((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    const updates = Object.entries(edited).map(([id, value]) => ({ id, value }));
    if (updates.length === 0) return;
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/multipliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const err = await res.json(); setError(err.error ?? 'Failed to save'); return; }
      setSaved(true);
      setEdited({});
      fetch_();
    } finally {
      setSaving(false);
    }
  };

  // Group by category
  const categories = Array.from(new Set(multipliers.map((m) => m.category ?? 'general')));
  const byCategory = (cat: string) => multipliers.filter((m) => (m.category ?? 'general') === cat);

  const hasEdits = Object.keys(edited).length > 0;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Formulas & Multipliers</h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Adjust calculation multipliers used across all estimates
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetch_} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSave}
            disabled={!hasEdits || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
              hasEdits
                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {saving ? <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
            {hasEdits && <span className="bg-slate-950/30 px-1.5 py-0.5 rounded text-xs">{Object.keys(edited).length}</span>}
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-900/20 border border-green-700 rounded-lg text-green-400 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Changes saved successfully. App will use new values on next calculation.
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 p-4 bg-blue-900/20 border border-blue-700/40 rounded-xl flex gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-slate-400 text-sm">
          These multipliers drive the material quantity calculations. Changes apply to new estimates immediately.
          Run <code className="text-cyan-400 bg-slate-800 px-1 rounded text-xs">npm run db:seed</code> to reset to defaults from the JSON data files.
        </p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse">Loading...</div>
      ) : multipliers.length === 0 ? (
        <div className="p-12 text-center">
          <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-slate-400">
            No multipliers in database yet. Run{' '}
            <code className="text-cyan-400 bg-slate-800 px-1 rounded">npm run db:seed</code> to populate from JSON files.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat} className="admin-card">
              <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-700">
                <h3 className="text-sm font-semibold capitalize text-slate-300">{cat}</h3>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Description</th>
                    <th className="w-40 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory(cat).map((m) => {
                    const currentVal = edited[m.id] ?? m.value;
                    const isChanged = edited[m.id] !== undefined && edited[m.id] !== m.value;
                    return (
                      <tr key={m.id}>
                        <td className="font-mono text-xs text-cyan-400">{m.key.split('.').slice(-2).join('.')}</td>
                        <td className="text-slate-400 text-sm capitalize">{(m.description ?? m.key).replace(/[._]/g, ' ')}</td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            {isChanged && (
                              <span className="text-[10px] text-amber-400 font-medium">changed</span>
                            )}
                            <input
                              type="number"
                              step="any"
                              value={currentVal}
                              onChange={(e) => handleChange(m.id, e.target.value)}
                              disabled={!m.isEditable}
                              className={`w-32 px-2 py-1 text-right rounded border text-sm font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400 ${
                                m.isEditable
                                  ? isChanged
                                    ? 'bg-amber-900/20 border-amber-500 text-amber-200'
                                    : 'bg-slate-950/60 border-slate-700 text-slate-100'
                                  : 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                              }`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
