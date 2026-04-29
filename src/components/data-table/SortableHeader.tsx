'use client';

import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { SortState } from './types';

interface Props {
  /** Column key — matches sort.key when this header is the active sort. */
  columnKey: string;
  label: string | React.ReactNode;
  sort: SortState | null;
  onToggle: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  /** Set false to render a non-clickable header (matches static <th> visually). */
  sortable?: boolean;
  className?: string;
}

/**
 * <th> with click-to-sort. Indicator on the active column shows the direction;
 * inactive sortable columns show a faint up/down icon as an affordance.
 *
 * Drop-in for the existing scorecard/management header style:
 *   `pb-2 text-{align} text-slate-{300|400} font-{medium|semibold}`
 *
 * Caller passes through additional Tailwind via className.
 */
export default function SortableHeader({
  columnKey,
  label,
  sort,
  onToggle,
  align = 'left',
  sortable = true,
  className = '',
}: Props) {
  const isActive = sort?.key === columnKey;
  const dir = isActive ? sort.dir : null;
  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  if (!sortable) {
    return (
      <th className={className}>
        <span className={`flex items-center gap-1 ${justify}`}>{label}</span>
      </th>
    );
  }

  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onToggle(columnKey)}
        aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
        className={`flex items-center gap-1 w-full ${justify} hover:text-white transition select-none print:cursor-default`}
      >
        <span>{label}</span>
        {dir === 'asc' && <ChevronUp className="w-3 h-3 text-cyan-400 print:hidden" aria-hidden />}
        {dir === 'desc' && <ChevronDown className="w-3 h-3 text-cyan-400 print:hidden" aria-hidden />}
        {!isActive && (
          <ChevronsUpDown className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 print:hidden" aria-hidden />
        )}
      </button>
    </th>
  );
}
