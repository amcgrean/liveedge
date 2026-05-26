'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Session } from 'next-auth';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

interface CalendarBid {
  id: number;
  projectName: string;
  planType: string;
  dueDate: string;
  customerName: string | null;
}

interface Props {
  session: Session;
  embedded?: boolean;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function planTypeColor(planType: string) {
  return planType === 'Commercial'
    ? 'bg-blue-900/70 text-blue-200 border-blue-700/50'
    : 'bg-green-900/70 text-green-200 border-green-700/50';
}

export default function BidCalendarClient({ session: _session, embedded: _embedded = false }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-based
  const [bids, setBids]   = useState<CalendarBid[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBids = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/legacy-bids/calendar?year=${year}&month=${month}`);
      const data = await res.json();
      setBids(data.bids ?? []);
    } catch {
      setBids([]);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); };

  // Build the grid: 6 rows × 7 cols
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth  = new Date(year, month, 0).getDate();
  const startDow     = firstOfMonth.getDay(); // 0=Sun

  const cells: { date: Date | null; isCurrentMonth: boolean }[] = [];
  // Prefix: days from previous month
  const prevMonthDays = new Date(year, month - 1, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 2, prevMonthDays - i), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), isCurrentMonth: true });
  }
  // Suffix: next month
  while (cells.length % 7 !== 0) {
    const day = cells.length - startDow - daysInMonth + 1;
    cells.push({ date: new Date(year, month, day), isCurrentMonth: false });
  }

  // Index bids by ISO date string (YYYY-MM-DD)
  const bidsByDate = new Map<string, CalendarBid[]>();
  for (const bid of bids) {
    if (!bid.dueDate) continue;
    const key = bid.dueDate.slice(0, 10);
    if (!bidsByDate.has(key)) bidsByDate.set(key, []);
    bidsByDate.get(key)!.push(bid);
  }

  const todayKey = now.toISOString().slice(0, 10);

  // Summary counts for the header
  const totalThisMonth = bids.filter((b) => {
    const d = b.dueDate.slice(0, 10);
    return d >= `${year}-${String(month).padStart(2, '0')}-01` &&
           d <= `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  }).length;

  const commercial = bids.filter((b) => b.planType === 'Commercial').length;
  const residential = bids.filter((b) => b.planType !== 'Commercial').length;

  return (
    <div>
      {/* Month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold w-48 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={goToday}
            className="ml-2 px-2.5 py-1 text-xs border border-gray-700 rounded hover:border-cyan-500/50 text-gray-400 hover:text-white"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{totalThisMonth} bid{totalThisMonth !== 1 ? 's' : ''} due</span>
          {commercial > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />
              {commercial} Commercial
            </span>
          )}
          {residential > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-600 inline-block" />
              {residential} Residential
            </span>
          )}
          <button
            onClick={fetchBids}
            className="p-1 rounded hover:bg-gray-800"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-gray-800">
          {DOW.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            if (!cell.date) return <div key={idx} className="min-h-[90px] border-b border-r border-gray-800/60 p-1" />;
            const key = cell.date.toISOString().slice(0, 10);
            const dayBids = bidsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            const isPast  = key < todayKey && cell.isCurrentMonth;

            return (
              <div
                key={idx}
                className={`min-h-[90px] border-b border-r border-gray-800/60 p-1 ${
                  !cell.isCurrentMonth ? 'bg-gray-900/30' : ''
                } ${isToday ? 'bg-cyan-950/30' : ''}`}
              >
                {/* Date number */}
                <div
                  className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-cyan-600 text-white'
                      : !cell.isCurrentMonth
                      ? 'text-gray-700'
                      : isPast
                      ? 'text-gray-600'
                      : 'text-gray-400'
                  }`}
                >
                  {cell.date.getDate()}
                </div>

                {/* Bid chips */}
                <div className="space-y-0.5">
                  {dayBids.slice(0, 3).map((bid) => (
                    <Link
                      key={bid.id}
                      href={`/legacy-bids/${bid.id}`}
                      title={`${bid.projectName}${bid.customerName ? ` · ${bid.customerName}` : ''}`}
                      className={`block text-[10px] leading-tight px-1 py-0.5 rounded border truncate hover:opacity-80 ${planTypeColor(bid.planType)}`}
                    >
                      {bid.projectName}
                    </Link>
                  ))}
                  {dayBids.length > 3 && (
                    <div className="text-[10px] text-gray-500 pl-1">
                      +{dayBids.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-green-900/70 border border-green-700/50" />
          Residential
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-900/70 border border-blue-700/50" />
          Commercial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-cyan-600" />
          Today
        </span>
        <span className="text-gray-600">Only open (incomplete) bids are shown.</span>
      </div>
    </div>
  );
}
