'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, MapPin, Send, ChevronRight, Package } from 'lucide-react';
import { usePageTracking } from '@/hooks/usePageTracking';

type Customer = {
  cust_key: string; cust_code: string; cust_name: string | null;
  phone: string | null; email: string | null;
  terms: string | null; branch_code: string | null;
  rep_1: string | null;
};

type Order = {
  so_number: string; so_status: string | null; expect_date: string | null;
  reference: string | null; sale_type: string | null; rep_1: string | null; line_count: number;
};

type ShipTo = {
  seq_num: number | null; shipto_name: string | null;
  address_1: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null;
};

type Note = {
  id: number; note_type: string | null; body: string; rep_name: string | null; created_at: string | null;
};

type ShipToSummary = {
  seq_num: number | null;
  shipto_name: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  order_count: number;
  open_count: number;
  last_order_date: string | null;
  last_so_id: string | null;
};

type Tab = 'overview' | 'shiptos' | 'orders' | 'notes';

const SO_STATUS: Record<string, { label: string; color: string }> = {
  O: { label: 'Open',      color: 'text-blue-400' },
  K: { label: 'Picking',   color: 'text-yellow-400' },
  S: { label: 'Staged',    color: 'text-orange-400' },
  D: { label: 'Delivered', color: 'text-cyan-400' },
  I: { label: 'Invoiced',  color: 'text-green-400' },
  C: { label: 'Closed',    color: 'text-gray-500' },
};

const NOTE_TYPES = ['Call', 'Visit', 'Email', 'Quote Follow-Up', 'Issue', 'Other'];

function shipToHref(code: string, seq: number | null) {
  const s = seq == null ? -1 : seq;
  return `/sales/customers/${encodeURIComponent(code)}/ship-tos/${s}`;
}

function shipToAddress(s: ShipToSummary | ShipTo): string {
  const parts = [s.address_1, [s.city, s.state].filter(Boolean).join(', '), s.zip].filter(Boolean);
  return parts.join(' · ') || 'No address on file';
}

export default function CustomerProfileClient({ code, userName }: { code: string; userName: string }) {
  usePageTracking();
  const [tab, setTab] = useState<Tab>('overview');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [shiptosBasic, setShiptosBasic] = useState<ShipTo[]>([]);
  const [shiptos, setShiptos] = useState<ShipToSummary[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [shiptosLoading, setShiptosLoading] = useState(false);
  const [shiptosError, setShiptosError] = useState('');
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState('');

  // Note form
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState('Call');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sales/customers/${encodeURIComponent(code)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d: { customer: Customer; open_orders: Order[]; history: Order[]; ship_to: ShipTo[]; open_count?: number }) => {
        setCustomer(d.customer);
        const openList = d.open_orders ?? [];
        setOrders([...openList, ...(d.history ?? [])]);
        setOpenCount(d.open_count ?? openList.length);
        setShiptosBasic(d.ship_to ?? []);
      })
      .catch(() => setError('Customer not found or data unavailable.'))
      .finally(() => setLoading(false));
  }, [code]);

  const loadShiptos = useCallback(() => {
    setShiptosLoading(true);
    setShiptosError('');
    fetch(`/api/sales/customers/${encodeURIComponent(code)}/ship-tos`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({} as Record<string, unknown>));
        if (!r.ok) {
          const b = body as { error?: string; message?: string };
          throw new Error(b.message || b.error || `HTTP ${r.status}`);
        }
        return body as { shiptos: ShipToSummary[] };
      })
      .then((d) => setShiptos(d.shiptos ?? []))
      .catch((e: Error) => setShiptosError(e.message || 'Failed to load ship-tos'))
      .finally(() => setShiptosLoading(false));
  }, [code]);

  const loadNotes = useCallback(() => {
    setNotesLoading(true);
    fetch(`/api/sales/customers/${encodeURIComponent(code)}/notes`)
      .then((r) => r.json())
      .then((d: { notes: Note[] }) => setNotes(d.notes))
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [code]);

  useEffect(() => {
    if (tab === 'shiptos' && shiptos.length === 0) loadShiptos();
    if (tab === 'notes') loadNotes();
  }, [tab, shiptos.length, loadShiptos, loadNotes]);

  async function submitNote() {
    if (!noteBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/customers/${encodeURIComponent(code)}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody.trim(), note_type: noteType, rep_name: userName }),
      });
      if (!res.ok) throw new Error('Failed');
      const note = await res.json() as Note;
      setNotes((prev) => [note, ...prev]);
      setNoteBody('');
    } catch {
      alert('Failed to save note.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-500">Loading customer...</div>
    );
  }

  if (error || !customer) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link href="/sales/customers" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <div className="text-red-400">{error || 'Customer not found.'}</div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: string | number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'shiptos',  label: 'Ship-Tos', badge: shiptosBasic.length || undefined },
    { id: 'orders',   label: 'Orders', badge: orders.length },
    { id: 'notes',    label: 'Notes' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      {/* Back + title */}
      <Link href="/sales/customers" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </Link>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white break-words">{customer.cust_name ?? customer.cust_code}</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            <span className="font-mono text-cyan-300">{customer.cust_code}</span>
            {customer.branch_code && <span className="ml-2 text-gray-500">{customer.branch_code}</span>}
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{openCount}</div>
            <div className="text-gray-500 text-xs">Open Orders</div>
          </div>
        </div>
      </div>

      {/* Tabs — horizontal scroll on small screens */}
      <div className="flex gap-1 border-b border-gray-800 mb-6 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium whitespace-nowrap transition shrink-0 ${
              tab === t.id
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}{t.badge != null ? ` (${t.badge})` : ''}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Contact */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Contact</h3>
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="flex items-center gap-3 text-sm hover:text-cyan-300 transition">
                <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-white break-all">{customer.phone}</span>
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="flex items-center gap-3 text-sm hover:text-cyan-300 transition">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="text-white break-all">{customer.email}</span>
              </a>
            )}
            {!customer.phone && !customer.email && (
              <p className="text-gray-600 text-sm">No contact info</p>
            )}
          </div>

          {customer.terms && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Account</h3>
              <div className="text-sm text-gray-400">
                Terms: <span className="text-white">{customer.terms}</span>
              </div>
            </div>
          )}

          {/* Ship-to summary — full list on the Ship-Tos tab */}
          {shiptosBasic.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5 md:col-span-2">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Ship-To Addresses ({shiptosBasic.length})
                </h3>
                <button onClick={() => setTab('shiptos')} className="text-xs text-cyan-400 hover:underline shrink-0">
                  View all →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {shiptosBasic.slice(0, 4).map((s, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      {s.shipto_name && <div className="text-white font-medium break-words">{s.shipto_name}</div>}
                      {s.address_1 && <div className="text-gray-400 break-words">{s.address_1}</div>}
                      {(s.city || s.state) && (
                        <div className="text-gray-400 break-words">{[s.city, s.state, s.zip].filter(Boolean).join(', ')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick link to orders */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5 md:col-span-2">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Activity (90 days)</h3>
            {orders.length === 0 ? (
              <p className="text-gray-600 text-sm">No orders in the last 90 days.</p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 5).map((o) => (
                  <div key={o.so_number} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-cyan-300 shrink-0">{o.so_number}</span>
                      {o.reference && <span className="text-gray-400 truncate">{o.reference}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {o.expect_date && <span className="text-gray-500 hidden sm:inline">{new Date(o.expect_date).toLocaleDateString()}</span>}
                      <span className={SO_STATUS[o.so_status ?? '']?.color ?? 'text-gray-400'}>
                        {SO_STATUS[o.so_status ?? '']?.label ?? o.so_status ?? '—'}
                      </span>
                    </div>
                  </div>
                ))}
                {orders.length > 5 && (
                  <button onClick={() => setTab('orders')} className="text-xs text-cyan-400 hover:underline mt-1">
                    View all {orders.length} orders →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ship-Tos tab — clickable list of customer ship-to addresses */}
      {tab === 'shiptos' && (
        <div>
          {shiptosLoading && <p className="text-gray-500 text-sm">Loading ship-tos...</p>}
          {shiptosError && (
            <p className="text-red-400 text-sm mb-3">Error loading ship-tos: {shiptosError}</p>
          )}
          {!shiptosLoading && !shiptosError && shiptos.length === 0 && (
            <p className="text-gray-500 text-sm">No ship-tos found for this customer.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shiptos.map((s) => (
              <Link
                key={`${s.seq_num ?? 'none'}`}
                href={shipToHref(code, s.seq_num)}
                className="group block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-cyan-600 hover:bg-gray-800/50 active:bg-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white break-words">
                        {s.shipto_name || s.address_1 || (s.seq_num == null ? 'No ship-to assigned' : `Ship-To #${s.seq_num}`)}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 break-words">
                        {shipToAddress(s)}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs flex-wrap">
                  <span className="inline-flex items-center gap-1 text-gray-300">
                    <Package className="w-3 h-3" />
                    {s.order_count} order{s.order_count !== 1 ? 's' : ''}
                  </span>
                  {s.open_count > 0 && (
                    <span className="text-blue-400">{s.open_count} open</span>
                  )}
                  {s.last_order_date && (
                    <span className="text-gray-500 ml-auto">
                      Last: {new Date(s.last_order_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Orders tab — mobile cards, desktop table */}
      {tab === 'orders' && (
        <div>
          {orders.length === 0 ? (
            <p className="text-gray-500 text-sm">No orders in the last 90 days.</p>
          ) : (
            <>
              {/* Mobile card list */}
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
                    {o.reference && (
                      <div className="text-sm text-gray-300 mt-1 break-words">{o.reference}</div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                      {o.sale_type && <span className="uppercase">{o.sale_type}</span>}
                      {o.rep_1 && <span>{o.rep_1}</span>}
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
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 hidden md:table-cell">Type</th>
                        <th className="px-4 py-3 hidden lg:table-cell">Rep</th>
                        <th className="px-4 py-3 text-right">Expect</th>
                        <th className="px-4 py-3 text-right hidden md:table-cell">Lines</th>
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
                          <td className={`px-4 py-3 font-medium ${SO_STATUS[o.so_status ?? '']?.color ?? 'text-gray-400'}`}>
                            {SO_STATUS[o.so_status ?? '']?.label ?? o.so_status ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-400 uppercase text-xs hidden md:table-cell">{o.sale_type ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{o.rep_1 ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-400">
                            {o.expect_date ? new Date(o.expect_date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 hidden md:table-cell">{o.line_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Notes tab */}
      {tab === 'notes' && (
        <div className="space-y-6">
          {/* Add note form */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Add Note</h3>
            <div className="flex gap-3 mb-3">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white w-full sm:w-auto"
              >
                {NOTE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="Write a note about this customer..."
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={submitNote}
                disabled={submitting || !noteBody.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {notesLoading && <p className="text-gray-500 text-sm">Loading notes...</p>}
          {!notesLoading && notes.length === 0 && (
            <p className="text-gray-600 text-sm">No notes yet.</p>
          )}
          {notes.map((n) => (
            <div key={n.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-3">
                  {n.note_type && (
                    <span className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-gray-300">
                      {n.note_type}
                    </span>
                  )}
                  {n.rep_name && <span className="text-sm text-gray-400">{n.rep_name}</span>}
                </div>
                <span className="text-xs text-gray-600">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                </span>
              </div>
              <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">{n.body}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
