'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { TopNav } from '../../src/components/nav/TopNav';
import { Search, RefreshCw, Plus, ChevronLeft, ChevronRight, Upload, X, Download, AlertCircle, CheckCircle } from 'lucide-react';

interface EWPRow {
  id: number;
  planNumber: string;
  address: string;
  tjiDepth: string | null;
  assignedDesigner: string | null;
  loginDate: string | null;
  layoutFinalized: string | null;
  agilityQuote: string | null;
  importedStellar: string | null;
  notes: string | null;
  customerName: string | null;
  customerCode: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: { row: number; reason: string }[];
}

interface Props { session: Session; }

export default function EWPClient({ session }: Props) {
  const [ewps, setEwps] = useState<EWPRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const limit = 50;

  // Import modal state
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEWPs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (search) params.set('q', search);
    try {
      const res = await fetch(`/api/ewp?${params}`);
      const data = await res.json();
      setEwps(data.ewps ?? []);
      setTotal(data.total ?? 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchEWPs(); }, [fetchEWPs]);

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';
  const totalPages = Math.ceil(total / limit);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? '');
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) { setImportError('Paste CSV data or upload a file first'); return; }
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const res = await fetch('/api/ewp/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csvText,
      });
      const data = await res.json();
      if (!res.ok && !data.imported) {
        setImportError(data.error ?? 'Import failed');
      } else {
        setImportResult(data);
        if (data.imported > 0) fetchEWPs();
      }
    } catch { setImportError('Network error'); }
    finally { setImporting(false); }
  };

  const closeImport = () => {
    setShowImport(false);
    setCsvText('');
    setImportResult(null);
    setImportError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <TopNav userName={session.user?.name} userRole={session.user?.role} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">EWP</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium"
            >
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <Link href="/ewp/add" className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> New EWP
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search EWPs..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          <button onClick={fetchEWPs} className="p-2 bg-gray-900 border border-gray-700 rounded-lg hover:border-cyan-500/50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="px-4 py-3 text-left font-medium">Plan #</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Address</th>
                <th className="px-4 py-3 text-left font-medium">TJI Depth</th>
                <th className="px-4 py-3 text-left font-medium">Designer</th>
                <th className="px-4 py-3 text-left font-medium">Logged</th>
                <th className="px-4 py-3 text-left font-medium">Layout</th>
                <th className="px-4 py-3 text-left font-medium">Agility</th>
                <th className="px-4 py-3 text-left font-medium">Stellar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : ewps.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No EWPs found</td></tr>
              ) : ewps.map((e) => (
                <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <Link href={`/ewp/${e.id}`} className="text-cyan-400 hover:text-cyan-300 font-mono text-xs">{e.planNumber}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{e.customerName ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{e.address}</td>
                  <td className="px-4 py-3 text-gray-300">{e.tjiDepth ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-300">{e.assignedDesigner ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.loginDate)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.layoutFinalized)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.agilityQuote)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(e.importedStellar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
            <span>{page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-gray-800 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* CSV Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-lg font-semibold">Import EWP from CSV</h2>
              <button onClick={closeImport} className="p-1 rounded hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg text-sm text-gray-300">
                <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Required columns: <code className="text-cyan-400">plan_number, customer_code, address, tji_depth</code></span>
                <a
                  href="/api/ewp/import"
                  download="ewp-import-template.csv"
                  className="ml-auto text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
                >
                  Download template
                </a>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Upload CSV file</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Or paste CSV data</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={8}
                  placeholder={'plan_number,customer_code,address,tji_depth,...\nD-2401-001,SMITH,123 Main St,9-1/2",...'}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs font-mono focus:outline-none focus:border-cyan-500 resize-y"
                />
              </div>

              {importError && (
                <div className="flex items-start gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {importError}
                </div>
              )}

              {importResult && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-700 rounded-lg text-green-300 text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Imported {importResult.imported} of {importResult.total} rows ({importResult.skipped} skipped)</span>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="bg-gray-800 rounded-lg p-3">
                      <p className="text-xs text-gray-400 font-medium mb-2">Row errors:</p>
                      <ul className="space-y-1">
                        {importResult.errors.map((e, i) => (
                          <li key={i} className="text-xs text-red-400">Row {e.row}: {e.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-800">
              <button onClick={closeImport} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
                {importResult ? 'Close' : 'Cancel'}
              </button>
              {!importResult && (
                <button
                  onClick={handleImport}
                  disabled={importing || !csvText.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  <Upload className="w-4 h-4" />
                  {importing ? 'Importing...' : 'Import'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
