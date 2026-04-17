'use client';

import { useState, useEffect, useCallback } from 'react';
import KioskScanClient from './KioskScanClient';
import KioskWorkOrdersClient from './KioskWorkOrdersClient';

const PICK_TYPES = [
  { id: 1, name: 'Yard',      color: 'bg-green-800 hover:bg-green-700 border-green-600' },
  { id: 2, name: 'Door 1',    color: 'bg-blue-800 hover:bg-blue-700 border-blue-600' },
  { id: 3, name: 'Decking',   color: 'bg-yellow-800 hover:bg-yellow-700 border-yellow-600' },
  { id: 4, name: 'EWP',       color: 'bg-purple-800 hover:bg-purple-700 border-purple-600' },
  { id: 5, name: 'Millwork',  color: 'bg-orange-800 hover:bg-orange-700 border-orange-600' },
  { id: 6, name: 'Will Call', color: 'bg-cyan-800 hover:bg-cyan-700 border-cyan-600' },
];

interface Picker {
  id: number;
  name: string;
  user_type: string | null;
  branch_code: string | null;
}

interface IncompletePick {
  id: number;
  barcode_number: string;
  shipment_num: string | null;
  start_time: string;
  pick_type_name: string | null;
}

type Step = 'select-picker' | 'select-type' | 'scan' | 'work-orders';

export default function KioskPickersClient({ branch, initialPickers = [] }: { branch: string; initialPickers?: Picker[] }) {
  const [pickers, setPickers] = useState<Picker[]>(initialPickers);
  const [loading, setLoading] = useState(false);
  const [selectedPicker, setSelectedPicker] = useState<Picker | null>(null);
  const [incompletePicks, setIncompletePicks] = useState<IncompletePick[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>('select-picker');
  const [completing, setCompleting] = useState<number | null>(null);

  const loadPickers = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/pickers?branch=${encodeURIComponent(branch)}`);
      if (res.ok) {
        const data = await res.json() as { pickers: Picker[] };
        setPickers(data.pickers ?? []);
      }
    } finally { setLoading(false); }
  }, [branch]);

  useEffect(() => {
    // Only show a loading spinner if server didn't provide initial pickers
    if (pickers.length === 0) {
      setLoading(true);
      loadPickers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 120s so an idle kiosk doesn't go stale
  useEffect(() => {
    const timer = setInterval(() => { loadPickers(); }, 120_000);
    return () => clearInterval(timer);
  }, [loadPickers, branch]);

  const selectPicker = async (picker: Picker) => {
    setSelectedPicker(picker);
    // Load incomplete picks
    const res = await fetch(`/api/kiosk/picks?picker_id=${picker.id}`);
    if (res.ok) {
      const data = await res.json() as { picks: IncompletePick[] };
      setIncompletePicks(data.picks ?? []);
    }
    setStep('select-type');
  };

  const completePick = async (pickId: number) => {
    setCompleting(pickId);
    try {
      await fetch('/api/kiosk/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pick_id: pickId, picker_id: selectedPicker?.id }),
      });
      setIncompletePicks((p) => p.filter((x) => x.id !== pickId));
    } finally { setCompleting(null); }
  };

  const selectType = (typeId: number) => {
    setSelectedTypeId(typeId);
    setStep('scan');
  };

  const reset = () => {
    setSelectedPicker(null);
    setSelectedTypeId(null);
    setIncompletePicks([]);
    setStep('select-picker');
  };

  if (step === 'scan' && selectedPicker && selectedTypeId) {
    return (
      <KioskScanClient
        branch={branch}
        picker={selectedPicker}
        pickTypeId={selectedTypeId}
        pickTypeName={PICK_TYPES.find((t) => t.id === selectedTypeId)?.name ?? 'Unknown'}
        onDone={reset}
      />
    );
  }

  if (step === 'work-orders' && selectedPicker) {
    return (
      <KioskWorkOrdersClient
        branch={branch}
        picker={selectedPicker}
        onDone={reset}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-bold text-cyan-400">Kiosk — {branch}</div>
          <div className="text-sm text-gray-500">Pick recording station</div>
        </div>
        {step !== 'select-picker' && (
          <button onClick={reset} className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5 bg-gray-800 rounded">
            ← Back
          </button>
        )}
      </div>

      <div className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">

        {/* STEP 1: Select picker */}
        {step === 'select-picker' && (
          <>
            <h2 className="text-lg font-semibold text-gray-300">Who are you?</h2>
            {loading ? (
              <div className="text-gray-500">Loading pickers…</div>
            ) : pickers.length === 0 ? (
              <div className="text-gray-500">No pickers configured for {branch}.</div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {pickers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => selectPicker(p)}
                    className="h-16 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-base font-semibold text-white transition active:scale-95 flex items-center justify-center text-center px-2"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* STEP 2: Select pick type (+ show incomplete picks) */}
        {step === 'select-type' && selectedPicker && (
          <>
            <div>
              <h2 className="text-lg font-semibold text-gray-300">
                Hi, <span className="text-white">{selectedPicker.name}</span>
              </h2>
              <p className="text-sm text-gray-500 mt-1">Select pick type to start scanning</p>
            </div>

            {incompletePicks.length > 0 && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 space-y-2">
                <div className="text-sm font-semibold text-yellow-300">
                  {incompletePicks.length} incomplete pick{incompletePicks.length !== 1 ? 's' : ''}
                </div>
                {incompletePicks.map((pick) => (
                  <div key={pick.id} className="flex items-center justify-between gap-3 bg-gray-900/60 rounded-lg px-3 py-2">
                    <div>
                      <div className="font-mono text-white text-sm">
                        {pick.barcode_number}{pick.shipment_num ? `-${pick.shipment_num}` : ''}
                      </div>
                      <div className="text-xs text-gray-500">
                        {pick.pick_type_name ?? 'Yard'} · started {new Date(pick.start_time).toLocaleTimeString()}
                      </div>
                    </div>
                    <button
                      onClick={() => completePick(pick.id)}
                      disabled={completing === pick.id}
                      className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded transition"
                    >
                      {completing === pick.id ? '…' : 'Complete'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {PICK_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => selectType(t.id)}
                  className={`py-6 px-4 border rounded-xl text-lg font-bold text-white transition active:scale-95 ${t.color}`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-800">
              <button
                onClick={() => setStep('work-orders')}
                className="w-full py-4 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl text-base font-semibold text-gray-300 transition active:scale-95"
              >
                Work Orders
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
