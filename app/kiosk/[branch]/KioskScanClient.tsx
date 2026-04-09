'use client';

import { useState, useRef, useEffect } from 'react';

interface Picker {
  id: number;
  name: string;
  user_type: string | null;
  branch_code: string | null;
}

interface ScanResult {
  action: 'completed' | 'started' | 'will_call_completed';
  message: string;
  pick_id?: number;
  barcode?: string;
  pick_type_name?: string;
  cust_name?: string | null;
}

interface Props {
  branch: string;
  picker: Picker;
  pickTypeId: number;
  pickTypeName: string;
  onDone: () => void;
}

export default function KioskScanClient({ branch, picker, pickTypeId, pickTypeName, onDone }: Props) {
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Re-focus after result clears
  useEffect(() => {
    if (!scanning) inputRef.current?.focus();
  }, [scanning]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = barcode.trim();
    if (!raw || scanning) return;

    setScanning(true);
    setBarcode('');

    try {
      const res = await fetch('/api/kiosk/smart-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picker_id: picker.id, barcode: raw, pick_type_id: pickTypeId, branch }),
      });
      const data = await res.json() as ScanResult & { error?: string };

      if (!res.ok) {
        const errResult: ScanResult = { action: 'completed', message: data.error ?? 'Error', barcode: raw };
        setLastResult(errResult);
        setHistory((h) => [errResult, ...h.slice(0, 19)]);
      } else {
        const result: ScanResult = { ...data, barcode: raw };
        setLastResult(result);
        setHistory((h) => [result, ...h.slice(0, 19)]);
      }
    } catch {
      const errResult: ScanResult = { action: 'completed', message: 'Network error', barcode: raw };
      setLastResult(errResult);
    } finally {
      setScanning(false);
    }
  };

  const resultColor = (action: ScanResult['action']) => {
    if (action === 'will_call_completed') return 'border-cyan-500 bg-cyan-900/30 text-cyan-300';
    if (action === 'completed') return 'border-green-500 bg-green-900/30 text-green-300';
    return 'border-blue-500 bg-blue-900/30 text-blue-300';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-bold text-cyan-400">Kiosk — {branch}</div>
          <div className="text-sm text-gray-400">
            {picker.name} · <span className="font-semibold text-white">{pickTypeName}</span>
          </div>
        </div>
        <button
          onClick={onDone}
          className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 bg-gray-800 rounded"
        >
          ← Done
        </button>
      </div>

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">
        {/* Scan input */}
        <form onSubmit={handleScan} className="space-y-3">
          <label className="block text-sm text-gray-400">Scan or enter barcode</label>
          <div className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              disabled={scanning}
              placeholder="e.g. 123456 or 123456-1"
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-4 text-xl font-mono text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={!barcode.trim() || scanning}
              className="px-6 py-4 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 rounded-xl text-lg font-bold transition active:scale-95"
            >
              {scanning ? '…' : 'Go'}
            </button>
          </div>
        </form>

        {/* Latest result */}
        {lastResult && (
          <div className={`border rounded-xl p-4 space-y-1 ${resultColor(lastResult.action)}`}>
            <div className="font-semibold text-base">{lastResult.message}</div>
            {lastResult.cust_name && (
              <div className="text-sm opacity-90 font-medium">{lastResult.cust_name}</div>
            )}
            {lastResult.barcode && (
              <div className="font-mono text-sm opacity-70">SO {lastResult.barcode}</div>
            )}
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Recent scans</div>
            {history.slice(1).map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-4 py-2"
              >
                <div className="font-mono text-sm text-gray-300">{r.barcode ?? '—'}</div>
                <div className="text-xs text-gray-500">{r.message}</div>
              </div>
            ))}
          </div>
        )}

        {/* Pick count */}
        {history.length > 0 && (
          <div className="text-center text-gray-600 text-sm">
            {history.length} scan{history.length !== 1 ? 's' : ''} this session
          </div>
        )}
      </div>
    </div>
  );
}
