// LiveEdge Sales — real API client.
//
// Maps the Bearer-authed web endpoints (app/api/sales/mobile/*) onto the
// shapes the Sales screens already consume (SalesCustomer / SalesOrder /
// SalesItem from salesMock.ts). Bearer token is attached by the axios
// interceptor in ./client. In dev mode (no EXPO_PUBLIC_BACKEND_URL) the
// salesMock.ts fetch* helpers short-circuit to fixtures and never call this.

import client from './client';
import { S } from '@/theme/colors';
import { format, parseISO } from 'date-fns';
import type {
  SalesCustomer, SalesOrder, SalesItem, OrderLine, OrderStatus, StockState,
} from '@/data/salesMock';

// ── formatting helpers ────────────────────────────────────────
const TONES = [S.delivery, S.blue, S.picking, S.invoiced, S.staged];

function monogram(name: string | null): string {
  if (!name) return '··';
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function toneFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMM d'); } catch { return iso; }
}

function cityState(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(', ');
}

// ── server response shapes (mirror of app/api/sales/mobile/_shared.ts) ──
interface ApiCustomer { code: string; name: string | null; city: string | null; state: string | null; open_orders: number }
interface ApiOrder {
  so_number: string; customer_name: string | null; customer_code: string | null;
  status: OrderStatus; total: number | null; expect_date: string | null;
  reference: string | null; po_number: string | null; line_count: number;
}
interface ApiOrderLine {
  sequence: number; item: string | null; description: string | null;
  qty_ordered: number | null; uom: string | null; price: number | null; extended_price: number | null;
}
interface ApiOrderDetail extends ApiOrder {
  sale_type: string | null; created_date: string | null; ship_via: string | null;
  branch_code: string | null; address_1: string | null; city: string | null; state: string | null;
  lines: ApiOrderLine[];
}
interface ApiItem {
  code: string; description: string | null; uom: string | null;
  qty_on_hand: number; stock: StockState; price: number | null;
}

// ── mappers ───────────────────────────────────────────────────
function mapCustomer(c: ApiCustomer): SalesCustomer {
  return {
    code: c.code,
    mono: monogram(c.name),
    tone: toneFor(c.code),
    name: c.name ?? c.code,
    city: cityState(c.city, c.state),
    tag: 'Customer',
    openOrders: c.open_orders,
  };
}

function mapOrder(o: ApiOrder): SalesOrder {
  return {
    so: o.so_number,
    custCode: o.customer_code ?? undefined,
    cust: o.customer_name ?? o.customer_code ?? o.so_number,
    status: o.status,
    total: money(o.total),
    date: shortDate(o.expect_date),
    items: o.line_count,
    poNumber: o.po_number ?? undefined,
  };
}

function mapLine(l: ApiOrderLine): OrderLine {
  return {
    qty: l.qty_ordered != null ? String(l.qty_ordered) : '0',
    uom: l.uom ?? 'EA',
    code: l.item ?? '',
    desc: l.description ?? l.item ?? '',
    price: l.price != null ? l.price.toFixed(2) : '0.00',
    ext: l.extended_price != null ? l.extended_price.toFixed(2) : '0.00',
  };
}

function mapItem(i: ApiItem): SalesItem {
  return {
    code: i.code,
    desc: i.description ?? i.code,
    price: i.price != null ? i.price.toFixed(2) : '—',
    uom: i.uom ?? 'EA',
    onhand: i.qty_on_hand,
    stock: i.stock,
  };
}

// ── calls ─────────────────────────────────────────────────────
export const salesApi = {
  async customers(q = ''): Promise<SalesCustomer[]> {
    const { data } = await client.get<{ customers: ApiCustomer[] }>('/api/sales/mobile/customers', { params: { q } });
    return data.customers.map(mapCustomer);
  },

  async customerDetail(code: string): Promise<{ customer: SalesCustomer; orders: SalesOrder[] }> {
    const { data } = await client.get<{ customer: ApiCustomer; orders: ApiOrder[] }>(`/api/sales/mobile/customers/${encodeURIComponent(code)}`);
    return { customer: mapCustomer(data.customer), orders: data.orders.map(mapOrder) };
  },

  async orders(q = ''): Promise<SalesOrder[]> {
    const { data } = await client.get<{ orders: ApiOrder[] }>('/api/sales/mobile/orders', { params: { q } });
    return data.orders.map(mapOrder);
  },

  async order(so: string): Promise<SalesOrder | undefined> {
    const { data } = await client.get<ApiOrderDetail>(`/api/sales/mobile/orders/${encodeURIComponent(so)}`);
    return {
      ...mapOrder(data),
      ship: cityState(data.city, data.state) || data.address_1 || undefined,
      branch: data.branch_code ?? undefined,
      lines: data.lines.map(mapLine),
    };
  },

  async items(q = ''): Promise<SalesItem[]> {
    const { data } = await client.get<{ items: ApiItem[] }>('/api/sales/mobile/items', { params: { q } });
    return data.items.map(mapItem);
  },

  async item(code: string): Promise<SalesItem | undefined> {
    const list = await this.items(code);
    return list.find((i) => i.code === code) ?? list[0];
  },
};
