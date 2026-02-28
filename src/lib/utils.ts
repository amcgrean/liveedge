import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-700 text-slate-200' },
  submitted: { label: 'Submitted', color: 'bg-blue-900/60 text-blue-300 border border-blue-700' },
  won: { label: 'Won', color: 'bg-green-900/60 text-green-300 border border-green-700' },
  lost: { label: 'Lost', color: 'bg-red-900/60 text-red-300 border border-red-700' },
  archived: { label: 'Archived', color: 'bg-slate-800 text-slate-400' },
};
