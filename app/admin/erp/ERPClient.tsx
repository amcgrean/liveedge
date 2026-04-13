'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Database, Play, ChevronDown, ChevronRight, Check, X, Eye, Zap, AlertCircle } from 'lucide-react';

interface AgilityStatusResult {
  configured: boolean;
  envVars: Record<string, boolean | string>;
}

interface AgilityTestResult {
  success: boolean;
  version?: string;
  branchCount?: number;
  branches?: { id: string; name: string }[];
  steps?: { step: string; ok: boolean; ms?: number; detail?: string }[];
  error?: string;
  durationMs?: number;
}

interface TableInfo {
  schema: string;
  name: string;
  columnCount: number;
  rowCount: number;
  columns: { name: string; type: string; nullable: boolean; default: string | null; maxLength: number | null }[];
}

interface SyncStatus {
  configured: boolean;
  envVars: Record<string, boolean>;
  lastSync: string | null;
  recentSyncs: { id: number; action: string; timestamp: string; changes: string | null }[];
}

export default function ERPClient() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<Record<string, unknown> | null>(null);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{ table: string; rows: Record<string, unknown>[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Agility API state
  const [agilityStatus, setAgilityStatus] = useState<AgilityStatusResult | null>(null);
  const [agilityTestResult, setAgilityTestResult] = useState<AgilityTestResult | null>(null);
  const [testingAgility, setTestingAgility] = useState(false);
  const [loadingAgilityStatus, setLoadingAgilityStatus] = useState(true);

  const fetchAgilityStatus = useCallback(async () => {
    setLoadingAgilityStatus(true);
    try {
      const res = await fetch('/api/admin/agility/status');
      if (res.ok) setAgilityStatus(await res.json());
    } finally { setLoadingAgilityStatus(false); }
  }, []);

  const handleTestAgility = async () => {
    setTestingAgility(true);
    setAgilityTestResult(null);
    try {
      const res = await fetch('/api/admin/agility/test', { method: 'POST' });
      const data = await res.json();
      setAgilityTestResult(data);
    } catch (err) {
      setAgilityTestResult({ success: false, error: err instanceof Error ? err.message : 'Network error' });
    } finally { setTestingAgility(false); }
  };

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/admin/erp/status');
      if (res.ok) setStatus(await res.json());
    } finally { setLoadingStatus(false); }
  }, []);

  const fetchTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await fetch('/api/admin/erp/introspect');
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables ?? []);
      }
    } finally { setLoadingTables(false); }
  }, []);

  useEffect(() => { fetchStatus(); fetchAgilityStatus(); }, [fetchStatus, fetchAgilityStatus]);

  const handleIntrospect = () => { fetchTables(); };

  const handleSync = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch('/api/admin/erp/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setSyncResult(data);
      fetchStatus(); // refresh last sync time
    } catch (err) {
      setSyncResult({ error: err instanceof Error ? err.message : 'Failed' });
    } finally { setSyncing(false); }
  };

  const handlePreview = async (tableName: string, schema: string) => {
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/admin/erp/query?table=${tableName}&schema=${schema}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setPreviewData({ table: `${schema}.${tableName}`, rows: data.rows ?? [] });
      }
    } finally { setLoadingPreview(false); }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : 'Never';

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" /> ERP Sync
        </h2>
        <div className="flex gap-3">
          <button onClick={fetchStatus} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 ${loadingStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Agility ERP API Card ───────────────────────────────────────────── */}
      <div className="admin-card p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> Agility ERP API
          </h3>
          <button onClick={fetchAgilityStatus} className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAgilityStatus ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingAgilityStatus ? (
          <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
        ) : agilityStatus ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {agilityStatus.configured ? (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <Check className="w-4 h-4" /> API credentials configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 text-sm">
                  <AlertCircle className="w-4 h-4" /> Not configured — set AGILITY_API_URL, AGILITY_USERNAME, AGILITY_PASSWORD
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {Object.entries(agilityStatus.envVars ?? {}).map(([key, val]) => {
                const present = typeof val === 'boolean' ? val : !!val;
                return (
                  <span key={key} className={`px-2 py-1 rounded ${present ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                    {key}: {typeof val === 'string' && !present ? 'Missing' : typeof val === 'string' ? val : present ? 'Set' : 'Missing'}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-red-400 text-sm">Failed to load Agility status</div>
        )}

        {/* Test button */}
        <div className="mt-4">
          <button
            onClick={handleTestAgility}
            disabled={testingAgility || !agilityStatus?.configured}
            className="flex items-center gap-2 px-4 py-2 bg-amber-800/60 hover:bg-amber-700/60 disabled:opacity-40 text-amber-200 border border-amber-700/50 rounded-lg text-sm font-medium transition"
          >
            {testingAgility ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {testingAgility ? 'Testing...' : 'Test Live Connection'}
          </button>
          {!agilityStatus?.configured && (
            <p className="text-xs text-slate-500 mt-1">Set env vars to enable live test.</p>
          )}
        </div>

        {/* Test result */}
        {agilityTestResult && (
          <div className={`mt-4 rounded-lg border p-3 ${agilityTestResult.success ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'}`}>
            {agilityTestResult.success ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <Check className="w-4 h-4" /> Connection successful
                  {agilityTestResult.durationMs && (
                    <span className="text-green-600 font-normal">{agilityTestResult.durationMs}ms</span>
                  )}
                </div>
                {agilityTestResult.version && (
                  <div className="text-xs text-slate-300">Version: <span className="text-white font-mono">{agilityTestResult.version}</span></div>
                )}
                {agilityTestResult.branches && agilityTestResult.branches.length > 0 && (
                  <div className="text-xs text-slate-400">
                    Branches ({agilityTestResult.branchCount}):
                    <span className="ml-1 text-slate-300">
                      {agilityTestResult.branches.map((b) => `${b.id} (${b.name})`).join(', ')}
                    </span>
                  </div>
                )}
                {agilityTestResult.steps && (
                  <div className="flex gap-3 flex-wrap mt-1">
                    {agilityTestResult.steps.map((s) => (
                      <span key={s.step} className="text-xs text-slate-500">
                        {s.step}: <span className="text-slate-400">{s.ms}ms</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {agilityTestResult.error ?? 'Test failed'}
                </div>
                {agilityTestResult.steps && agilityTestResult.steps.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {agilityTestResult.steps.map((s) => (
                      <div key={s.step} className={`text-xs px-2 py-1 rounded flex items-start gap-2 ${s.ok ? 'text-green-400' : 'text-red-400 bg-red-900/20'}`}>
                        <span className="font-mono font-medium shrink-0">{s.step}:</span>
                        <span>{s.ok ? `OK (${s.ms}ms)` : (s.detail ?? 'failed')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Card */}
      <div className="admin-card p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Connection Status</h3>
        {loadingStatus ? (
          <div className="text-slate-400 text-sm animate-pulse">Loading...</div>
        ) : status ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {status.configured ? (
                <span className="flex items-center gap-1 text-green-400 text-sm"><Check className="w-4 h-4" /> Supabase connected</span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 text-sm"><X className="w-4 h-4" /> Not configured</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {Object.entries(status.envVars ?? {}).map(([key, present]) => (
                <span key={key} className={`px-2 py-1 rounded ${present ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                  {key}: {present ? 'Set' : 'Missing'}
                </span>
              ))}
            </div>
            <div className="text-sm text-slate-400">
              Last sync: <span className="text-slate-200">{formatDate(status.lastSync)}</span>
            </div>
          </div>
        ) : (
          <div className="text-red-400 text-sm">Failed to load status</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button onClick={handleIntrospect} disabled={loadingTables}
          className="btn-primary flex items-center gap-2">
          {loadingTables ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {loadingTables ? 'Discovering...' : 'Discover Tables'}
        </button>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
          {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {syncing ? 'Syncing...' : 'Run Sync'}
        </button>
      </div>

      {/* Sync Result */}
      {syncResult && (
        <div className={`admin-card p-4 mb-6 ${(syncResult as { success?: boolean }).success === false ? 'border-red-700' : 'border-green-700'}`}>
          <h3 className="text-sm font-semibold text-white mb-2">Sync Result</h3>
          <pre className="text-xs text-slate-300 overflow-x-auto">{JSON.stringify(syncResult, null, 2)}</pre>
        </div>
      )}

      {/* Recent Sync Logs */}
      {status && status.recentSyncs.length > 0 && (
        <div className="admin-card mb-6">
          <div className="px-4 py-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Recent Sync History</h3>
          </div>
          <table className="admin-table">
            <thead><tr><th>Time</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {status.recentSyncs.map((s) => (
                <tr key={s.id}>
                  <td className="text-xs text-slate-400 whitespace-nowrap">{formatDate(s.timestamp)}</td>
                  <td className="text-sm text-slate-300">{s.action}</td>
                  <td className="text-xs text-slate-500 max-w-[300px] truncate">{s.changes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Discovered Tables */}
      {tables.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            ERP Tables ({tables.length} found)
          </h3>
          <div className="space-y-2">
            {tables.map((t) => {
              const key = `${t.schema}.${t.name}`;
              const isExpanded = expandedTable === key;
              return (
                <div key={key} className="admin-card">
                  <button onClick={() => setExpandedTable(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <span className="text-white font-medium">{t.schema}.{t.name}</span>
                      <span className="text-xs text-slate-500">{t.columnCount} cols</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">~{t.rowCount.toLocaleString()} rows</span>
                      <button onClick={(e) => { e.stopPropagation(); handlePreview(t.name, t.schema); }}
                        className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-cyan-400" title="Preview data">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-white/5">
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="text-left py-1 pr-4">Column</th>
                            <th className="text-left py-1 pr-4">Type</th>
                            <th className="text-left py-1 pr-4">Nullable</th>
                            <th className="text-left py-1">Default</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.columns.map((c) => (
                            <tr key={c.name} className="text-slate-400">
                              <td className="py-1 pr-4 text-white">{c.name}</td>
                              <td className="py-1 pr-4">{c.type}{c.maxLength ? `(${c.maxLength})` : ''}</td>
                              <td className="py-1 pr-4">{c.nullable ? 'yes' : 'no'}</td>
                              <td className="py-1 text-slate-500 truncate max-w-[150px]">{c.default ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data Preview */}
      {previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setPreviewData(null)} />
          <div className="relative bg-slate-900 border border-white/15 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <h3 className="font-bold text-white">Preview: {previewData.table}</h3>
              <button onClick={() => setPreviewData(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              {loadingPreview ? (
                <div className="text-center text-slate-400 animate-pulse py-8">Loading...</div>
              ) : previewData.rows.length === 0 ? (
                <div className="text-center text-slate-500 py-8">No rows</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/10">
                      {Object.keys(previewData.rows[0] ?? {}).map((k) => (
                        <th key={k} className="text-left py-2 px-2 whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-slate-800/50">
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="py-1.5 px-2 text-slate-300 max-w-[200px] truncate">
                            {v === null ? <span className="text-slate-600">null</span> : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
