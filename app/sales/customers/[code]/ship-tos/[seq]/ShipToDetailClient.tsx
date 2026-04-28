'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Package, Ruler, FileText, ExternalLink } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type ShipToDetail = {
  customer: { cust_code: string; cust_name: string | null };
  shipTo: {
    seq_num: number | null;
    shipto_name: string | null;
    address_1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    lat: number | null;
    lon: number | null;
  };
  orders: {
    so_number: string;
    system_id: string | null;
    so_status: string | null;
    sale_type: string | null;
    ship_via: string | null;
    reference: string | null;
    po_number: string | null;
    rep_1: string | null;
    expect_date: string | null;
    created_date: string | null;
    line_count: number;
  }[];
  takeoffs: {
    id: string;
    name: string;
    pdfFileName: string | null;
    pageCount: number;
    updatedAt: string | null;
    href: string;
  }[];
  quotes: {
    id: string;
    name: string;
    status: string | null;
    createdAt: string | null;
    amount: number | null;
  }[];
};

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'text-blue-400' },
  K: { label: 'Picking',   color: 'text-yellow-400' },
  S: { label: 'Staged',    color: 'text-orange-400' },
  D: { label: 'Delivered', color: 'text-cyan-400' },
  I: { label: 'Invoiced',  color: 'text-green-400' },
  C: { label: 'Closed',    color: 'text-gray-500' },
};

export default function ShipToDetailClient({ code, seq }: { code: string; seq: string }) {
  usePageTracking();
  const [data, setData] = useState<ShipToDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/customers/${encodeURIComponent(code)}/ship-tos/${encodeURIComponent(seq)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Ship-to not found');
        return r.json();
      })
      .then((d: ShipToDetail) => setData(d))
      .catch(() => setError('Ship-to not found or data unavailable.'))
      .finally(() => setLoading(false));
  }, [code, seq]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-500">Loading ship-to...</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href={`/sales/customers/${encodeURIComponent(code)}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Customer
        </Link>
        <div className="text-red-400">{error || 'Ship-to not found.'}</div>
      </div>
    );
  }

  const { customer, shipTo, orders, takeoffs, quotes } = data;
  const shipToTitle = shipTo.shipto_name
    || shipTo.address_1
    || (shipTo.seq_num == null ? 'No ship-to assigned' : `Ship-To #${shipTo.seq_num}`);
  const addressParts = [shipTo.address_1, [shipTo.city, shipTo.state].filter(Boolean).join(', '), shipTo.zip].filter(Boolean);
  const mapQuery = shipTo.lat && shipTo.lon
    ? `${shipTo.lat},${shipTo.lon}`
    : addressParts.length
    ? addressParts.join(', ')
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <Link
        href={`/sales/customers/${encodeURIComponent(code)}`}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {customer.cust_name || customer.cust_code}
      </Link>

      {/* Job header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white break-words flex items-start gap-2">
          <MapPin className="w-5 h-5 text-cyan-400 shrink-0 mt-1" />
          {shipToTitle}
        </h1>
        <div className="text-sm text-gray-400 mt-1 break-words pl-7">
          <Link
            href={`/sales/customers/${encodeURIComponent(code)}`}
            className="font-mono text-cyan-300 hover:underline"
          >
            {customer.cust_code}
          </Link>
          {customer.cust_name && <span className="text-gray-500"> — {customer.cust_name}</span>}
        </div>
        {addressParts.length > 0 && (
          <div className="text-sm text-gray-300 mt-2 pl-7 break-words">
            {addressParts.join(' · ')}
            {mapQuery && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
              >
                Map <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <SummaryCard icon={<Package className="w-4 h-4" />} label="Orders" value={orders.length} />
        <SummaryCard icon={<Ruler className="w-4 h-4" />}   label="Takeoffs" value={takeoffs.length} />
        <SummaryCard icon={<FileText className="w-4 h-4" />} label="Quotes" value={quotes.length} />
      </div>

      {/* Orders */}
      <Section title="Orders" count={orders.length}>
        {orders.length === 0 ? (
          <EmptyState text="No orders for this ship-to." />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {orders.map((o) => (
                <Link
                  key={o.so_number}
                  href={`/sales/orders/${encodeURIComponent(o.so_number)}`}
                  className="block bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-cyan-600 active:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-cyan-300 text-sm">{o.so_number}</span>
                    <span className={`text-xs font-medium ${SO_STATUS[o.so_status ?? '']?.color ?? 'text-gray-400'}`}>
                      {SO_STATUS[o.so_status ?? '']?.label ?? o.so_status ?? '—'}
                    </span>
                  </div>
                  {o.reference && <div className="text-sm text-gray-300 mt-1 break-words">{o.reference}</div>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                    {o.sale_type && <span className="uppercase">{o.sale_type}</span>}
                    {o.po_number && <span>PO {o.po_number}</span>}
                    {o.expect_date && <span>Expect {new Date(o.expect_date).toLocaleDateString()}</span>}
                    <span>{o.line_count} line{o.line_count !== 1 ? 's' : ''}</span>
                  </div>
                </Link>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden sm:block bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">SO #</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">PO</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 hidden md:table-cell">Type</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Rep</th>
                      <th className="px-4 py-3 text-right">Expect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.so_number} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-cyan-300 text-xs">
                          <Link href={`/sales/orders/${encodeURIComponent(o.so_number)}`} className="hover:underline">
                            {o.so_number}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate">{o.reference ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{o.po_number ?? '—'}</td>
                        <td className={`px-4 py-3 font-medium ${SO_STATUS[o.so_status ?? '']?.color ?? 'text-gray-400'}`}>
                          {SO_STATUS[o.so_status ?? '']?.label ?? o.so_status ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 uppercase text-xs hidden md:table-cell">{o.sale_type ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{o.rep_1 ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {o.expect_date ? new Date(o.expect_date).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* Takeoffs */}
      <Section title="Takeoffs" count={takeoffs.length}>
        {takeoffs.length === 0 ? (
          <EmptyState text="No takeoffs linked to this customer yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {takeoffs.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-cyan-600 active:bg-gray-800 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <Ruler className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white break-words">{t.name}</div>
                    {t.pdfFileName && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">{t.pdfFileName}</div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                      <span>{t.pageCount} page{t.pageCount !== 1 ? 's' : ''}</span>
                      {t.updatedAt && <span>Updated {new Date(t.updatedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* Quotes */}
      <Section title="Quotes" count={quotes.length}>
        {quotes.length === 0 ? (
          <div className="bg-gray-900 border border-dashed border-gray-800 rounded-lg p-6 text-center">
            <FileText className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Quotes aren&apos;t tracked yet.</p>
            <p className="text-xs text-gray-600 mt-1">They&apos;ll show up here once the quotes module is added.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">{q.name}</div>
                  {q.createdAt && (
                    <div className="text-xs text-gray-500">{new Date(q.createdAt).toLocaleDateString()}</div>
                  )}
                </div>
                {q.amount != null && (
                  <div className="text-sm font-mono text-cyan-300">${q.amount.toLocaleString()}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 sm:p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {title} <span className="text-gray-600">({count})</span>
      </h2>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 text-sm text-gray-500">{text}</div>
  );
}
