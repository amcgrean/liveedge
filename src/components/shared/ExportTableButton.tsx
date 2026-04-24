'use client';

import { useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';

export type ExportRow = Record<string, string | number | null | undefined>;

interface Props {
  data: ExportRow[];
  filename?: string;
  className?: string;
}

function toTsv(data: ExportRow[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = row[h] ?? '';
      const s = String(v);
      return s.includes('\t') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join('\t'),
  );
  return [headers.join('\t'), ...rows].join('\n');
}

function toCsv(data: ExportRow[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const rows = data.map((row) => headers.map((h) => escape(row[h])).join(','));
  return [headers.map(escape).join(','), ...rows].join('\n');
}

export default function ExportTableButton({ data, filename = 'export', className = '' }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const tsv = toTsv(data);
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const csv = toCsv(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={handleCopy}
        title="Copy table to clipboard (paste into Excel)"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <button
        onClick={handleDownload}
        title="Download as CSV"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition"
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </button>
    </div>
  );
}
