'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Printer } from 'lucide-react';

const RANGES = ['YTD', 'Full Year'] as const;
type Range = typeof RANGES[number];

const BRANCHES = [
  { code: '', label: 'All Branches' },
  { code: '10FD', label: 'Fort Dodge' },
  { code: '20GR', label: 'Grimes' },
  { code: '25BW', label: 'Birchwood' },
  { code: '40CV', label: 'Coralville' },
];

interface Props {
  baseYear: number;
  compareYear: number;
  period: string;
  cutoffDate: string;
  currentYear: number;
}

export default function ManagementFilterBar({ baseYear, compareYear, period, cutoffDate, currentYear }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => params.set(k, v));
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const today = new Date().toISOString().slice(0, 10);

  const displayedRange = (RANGES as readonly string[]).includes(period)
    ? (period as Range)
    : 'YTD';

  // Date context label
  const now = new Date();
  const monthNum = now.getMonth() + 1;
  const contextLabel = period === 'Full Year'
    ? `Full Year ${baseYear}`
    : `${baseYear} YTD through ${cutoffDate} · ${monthNum} of 12 mo`;

  return (
    <div
      className="print:hidden flex flex-wrap items-center gap-3 px-4 py-2.5 z-30"
      style={{
        position: 'sticky',
        top: 54,
        background: 'var(--panel)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      {/* Range segmented control */}
      <div className="seg">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => {
              const newCutoff = r === 'Full Year' ? `${baseYear}-12-31` : today;
              push({ period: r, cutoffDate: newCutoff });
            }}
            className={displayedRange === r ? 'active' : ''}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Branch scope segmented control */}
      <div className="seg">
        {BRANCHES.map((b) => (
          <button
            key={b.code}
            onClick={() => push({ branch: b.code })}
            className={searchParams.get('branch') === b.code ? 'active' : !searchParams.get('branch') && b.code === '' ? 'active' : ''}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Year selectors */}
      <div className="flex items-center gap-1">
        {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
          <button
            key={y}
            onClick={() => {
              const newCutoff = y === currentYear ? today : `${y}-12-31`;
              push({ baseYear: String(y), compareYear: String(y - 1), cutoffDate: newCutoff });
            }}
            className="text-xs px-2.5 py-1 rounded transition"
            style={{
              background: baseYear === y ? 'var(--panel-3)' : 'transparent',
              color: baseYear === y ? 'var(--text)' : 'var(--text-3)',
              border: `1px solid ${baseYear === y ? 'var(--line)' : 'transparent'}`,
            }}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Date context string */}
      <span className="hidden md:block text-xs mono ml-auto" style={{ color: 'var(--text-3)' }}>
        {contextLabel} · vs {compareYear}
      </span>

      {/* Print button */}
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition"
        style={{
          background: 'var(--panel-2)',
          border: '1px solid var(--line)',
          color: 'var(--text-2)',
        }}
      >
        <Printer className="w-3.5 h-3.5" />
        Print
      </button>
    </div>
  );
}
