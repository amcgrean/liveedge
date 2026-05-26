'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { RefreshCw, MapPin, Truck, Navigation, Clock } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

interface Vehicle {
  id: string;
  name: string;
  branch_code: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  time: string | null;
  address: string | null;
}

interface Props { isAdmin: boolean; userBranch: string | null; }

function speedLabel(speed: number | null): string {
  if (speed == null) return '—';
  return `${Math.round(speed)} mph`;
}

function lastSeen(time: string | null): string {
  if (!time) return '—';
  const mins = Math.round((Date.now() - new Date(time).getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function MapClient({ isAdmin, userBranch }: Props) {
  usePageTracking();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branch, setBranch] = useState(userBranch ?? '');

  const load = useCallback(async (br: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (br) params.set('branch', br);
      const res = await fetch(`/api/delivery/locations?${params}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to load vehicles');
        return;
      }
      const data = await res.json();
      setVehicles(data.vehicles ?? []);
    } catch {
      setError('Failed to load vehicle locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(branch);
    const iv = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        load(branch);
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [load, branch]);

  const moving = vehicles.filter((v) => (v.speed ?? 0) > 2);
  const stopped = vehicles.filter((v) => (v.speed ?? 0) <= 2);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/delivery" className="text-sm text-cyan-400 hover:underline">&larr; Delivery Tracker</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Fleet Map</h1>
          <p className="text-sm text-slate-400">Live vehicle locations — refreshes every 30s</p>
        </div>
        <div className="flex gap-3 items-center">
          {isAdmin && (
            <input
              value={branch}
              onChange={(e) => { setBranch(e.target.value); load(e.target.value); }}
              placeholder="Branch (all)"
              className="w-28 bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          )}
          <div className="flex gap-2 text-sm">
            <span className="px-2.5 py-1 bg-green-500/20 text-green-300 rounded-lg font-medium">{moving.length} moving</span>
            <span className="px-2.5 py-1 bg-slate-700 text-slate-400 rounded-lg">{stopped.length} stopped</span>
          </div>
          <button
            onClick={() => load(branch)}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
          {error === 'Samsara not configured' ? (
            <>Samsara GPS integration is not configured for this environment.</>
          ) : error}
        </div>
      )}

      {/* Map placeholder — Samsara iframe or external map can go here */}
      {!error && vehicles.length > 0 && (
        <div className="bg-slate-900 border border-white/10 rounded-xl p-4 text-center text-slate-500 text-sm h-48 flex items-center justify-center gap-3">
          <MapPin className="w-5 h-5 text-slate-600" />
          <span>Interactive map — embed a mapping provider here using vehicle coordinates below</span>
        </div>
      )}

      {/* Vehicle grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {vehicles.length === 0 && !loading && !error ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            No vehicles found{branch ? ` for branch ${branch}` : ''}.
          </div>
        ) : vehicles.map((v) => {
          const isMoving = (v.speed ?? 0) > 2;
          return (
            <div
              key={v.id}
              className={`bg-slate-900 border rounded-xl p-4 ${isMoving ? 'border-green-500/30' : 'border-white/10'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Truck className={`w-4 h-4 ${isMoving ? 'text-green-400' : 'text-slate-500'}`} />
                  <span className="text-white font-medium text-sm">{v.name}</span>
                </div>
                {v.branch_code && (
                  <span className="text-xs text-slate-500 font-mono">{v.branch_code}</span>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                {v.address && (
                  <div className="flex items-start gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{v.address}</span>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <span className={`flex items-center gap-1 ${isMoving ? 'text-green-400' : 'text-slate-400'}`}>
                    <Navigation className="w-3 h-3" />
                    {speedLabel(v.speed)}
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock className="w-3 h-3" />
                    {lastSeen(v.time)}
                  </span>
                </div>
                {v.latitude != null && v.longitude != null && (
                  <div className="text-slate-600 font-mono">
                    {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
