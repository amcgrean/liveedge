'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, TrendingUp, Settings, Users, Package, Building2, ChevronLeft } from 'lucide-react';

const BRANCHES = [
  { code: '10FD', label: 'Fort Dodge' },
  { code: '20GR', label: 'Grimes' },
  { code: '25BW', label: 'Birchwood' },
  { code: '40CV', label: 'Coralville' },
];

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'kpis', label: 'KPIs', icon: TrendingUp },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'product-mix', label: 'Product Mix', icon: Package },
  { id: 'sale-types', label: 'Sale Types', icon: Settings },
  { id: 'detail', label: 'Detail Metrics', icon: Building2 },
];

interface Props {
  branchId: string;
  qs: string;
}

export default function ScorecardSidebarNav({ branchId, qs }: Props) {
  const pathname = usePathname();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      className="hidden lg:flex flex-col gap-0.5 print:hidden"
      style={{
        position: 'sticky',
        top: 54,
        height: 'calc(100vh - 54px)',
        width: 220,
        flexShrink: 0,
        background: 'var(--panel)',
        borderRight: '1px solid var(--line)',
        padding: '12px 8px',
        overflowY: 'auto',
      }}
    >
      {/* Section label */}
      <div
        className="px-3 mb-2 text-[10px] font-bold tracking-[0.1em] uppercase"
        style={{ color: 'var(--text-3)' }}
      >
        Branch Scorecard
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => scrollTo(id)}
          className="flex items-center gap-2 px-3 py-2 rounded text-left w-full transition text-sm"
          style={{ color: 'var(--text-2)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
          {label}
        </button>
      ))}

      {/* Divider */}
      <div className="my-3" style={{ borderTop: '1px solid var(--line)' }} />

      {/* Branch list */}
      <div
        className="px-3 mb-1 text-[10px] font-bold tracking-[0.1em] uppercase"
        style={{ color: 'var(--text-3)' }}
      >
        Switch Branch
      </div>
      {BRANCHES.map((b) => {
        const isActive = b.code === branchId;
        return (
          <Link
            key={b.code}
            href={`/scorecard/branch/${b.code}?${qs}`}
            className="flex items-center gap-2 px-3 py-2 rounded text-sm transition"
            style={{
              color: isActive ? 'var(--text)' : 'var(--text-2)',
              background: isActive ? 'var(--panel-2)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--green-bright)' : '2px solid transparent',
            }}
          >
            {b.label}
          </Link>
        );
      })}

      {/* Back link at bottom */}
      <div className="mt-auto pt-4">
        <Link
          href={`/management?${qs}`}
          className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition"
          style={{ color: 'var(--text-3)' }}
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Management
        </Link>
      </div>
    </nav>
  );
}
