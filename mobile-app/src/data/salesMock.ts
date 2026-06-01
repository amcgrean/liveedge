// LiveEdge Sales — mock data layer.
//
// Mirrors the static fixtures in the Claude Design handoff so the Sales
// screens render exactly as designed before the real backend lands. This is
// the sales analogue of `mockRoute.ts` for the driver app.
//
// When the Agility-backed API is wired (see docs handoff), replace the
// `fetch*` helpers below with real calls — the screens consume these shapes,
// not the fixtures directly.

import { S } from '@/theme/colors';

export type OrderStatus = 'open' | 'picking' | 'staged' | 'delivery' | 'invoiced';
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  open: 'Open',
  picking: 'Picking',
  staged: 'Staged',
  delivery: 'Out for Delivery',
  invoiced: 'Invoiced',
};

export interface SalesCustomer {
  code: string;        // C-10428
  mono: string;        // monogram initials
  tone: string;        // accent color
  name: string;
  city: string;        // "Urbandale, IA"
  tag: string;         // "Contractor" | "Builder" | "Trade"
  openOrders: number;
}

export interface OrderLine {
  qty: string;
  uom: string;
  code: string;
  desc: string;
  price: string;       // per-uom unit price
  ext: string;         // extended price
  fill?: 'full' | 'partial' | 'back';
}

export interface SalesOrder {
  so: string;          // 102-44947
  custCode?: string;
  cust: string;
  status: OrderStatus;
  total: string;
  date: string;
  items: number;
  ship?: string;
  poNumber?: string;
  reqDate?: string;
  branch?: string;
  lines?: OrderLine[];
}

export type StockState = 'in' | 'low' | 'out';

export interface SalesItem {
  code: string;
  desc: string;
  category?: string;
  price: string;
  list?: string;
  uom: string;
  onhand: number;
  stock: StockState;
  byBranch?: { code: string; name: string; onhand: number }[];
}

// ── Customers ─────────────────────────────────────────────────
export const MOCK_CUSTOMERS: SalesCustomer[] = [
  { code: 'C-10428', mono: 'HC', tone: S.delivery, name: 'Holstead Construction', city: 'Urbandale, IA', tag: 'Contractor', openOrders: 3 },
  { code: 'C-10455', mono: 'GH', tone: S.blue, name: 'Greenway Homes', city: 'Waukee, IA', tag: 'Builder', openOrders: 5 },
  { code: 'C-10387', mono: 'HF', tone: S.invoiced, name: 'Hawkeye Framing Co.', city: 'West Des Moines, IA', tag: 'Contractor', openOrders: 1 },
  { code: 'C-10502', mono: 'CC', tone: S.picking, name: 'Cardinal Carpentry', city: 'Bondurant, IA', tag: 'Trade', openOrders: 0 },
  { code: 'C-10331', mono: 'RB', tone: S.staged, name: 'Riverbend Decks', city: 'Ankeny, IA', tag: 'Contractor', openOrders: 2 },
];

// ── Orders ────────────────────────────────────────────────────
export const MOCK_ORDERS: SalesOrder[] = [
  {
    so: '102-44947', custCode: 'C-10428', cust: 'Brenneman Residence', status: 'picking',
    total: '$4,182.50', date: 'May 27', items: 6, ship: 'Jobsite — Hickory Ln',
    poNumber: 'BR-2026-0511', reqDate: 'May 29', branch: '20GR',
    lines: [
      { qty: '24', uom: 'EA', code: 'SPF2X4-92', desc: 'SPF 2×4 92⅝" Stud', price: '4.18', ext: '100.32', fill: 'full' },
      { qty: '18', uom: 'SHT', code: 'OSB-716-4X8', desc: 'OSB Sheathing 7/16" 4×8', price: '18.40', ext: '331.20', fill: 'full' },
      { qty: '8', uom: 'EA', code: 'LVL-11875', desc: 'LVL 1¾×11⅞ × 16′', price: '92.10', ext: '736.80', fill: 'partial' },
      { qty: '4', uom: 'ROL', code: 'TYVK-HW9', desc: 'Tyvek HomeWrap 9×100', price: '164.00', ext: '656.00', fill: 'back' },
    ],
  },
  { so: '102-44951', custCode: 'C-10387', cust: 'Hawkeye Framing Co.', status: 'open', total: '$9,310.00', date: 'May 27', items: 18 },
  { so: '102-44930', custCode: 'C-10455', cust: 'M&B Roofing LLC', status: 'delivery', total: '$11,920.00', date: 'May 27', items: 24 },
  { so: '102-44944', cust: 'Stadler Lot — 22', status: 'staged', total: '$1,455.80', date: 'May 26', items: 4 },
  { so: '102-44922', custCode: 'C-10455', cust: 'Greenway Homes — Lot 14', status: 'invoiced', total: '$2,640.75', date: 'May 26', items: 8 },
  { so: '102-44918', custCode: 'C-10428', cust: 'Holstead Construction', status: 'invoiced', total: '$6,012.40', date: 'May 25', items: 12 },
];

// Open orders shown on a customer detail page.
export const MOCK_CUSTOMER_ORDERS: SalesOrder[] = [
  { so: '102-44947', cust: 'Holstead Construction', status: 'picking', total: '$4,182.50', date: 'May 27', items: 6, ship: 'Jobsite — Hickory Ln' },
  { so: '102-45011', cust: 'Holstead Construction', status: 'open', total: '$1,290.00', date: 'May 26', items: 3, ship: 'Will Call' },
  { so: '102-45044', cust: 'Holstead Construction', status: 'staged', total: '$8,755.20', date: 'May 25', items: 14, ship: 'Yard 20GR' },
];

// ── Items ─────────────────────────────────────────────────────
export const MOCK_ITEMS: SalesItem[] = [
  {
    code: 'SPF2X4-92', desc: 'SPF 2×4 92⅝" Precut Stud', category: 'Dimensional Lumber',
    price: '4.18', list: '4.92', uom: 'EA', onhand: 1840, stock: 'in',
    byBranch: [
      { code: '20GR', name: 'Grimes', onhand: 1840 },
      { code: '10FD', name: 'Fort Dodge', onhand: 920 },
      { code: '25BW', name: 'Birchwood', onhand: 0 },
      { code: '40CV', name: 'Coralville', onhand: 440 },
    ],
  },
  { code: 'OSB-716-4X8', desc: 'OSB Sheathing 7/16" 4×8', category: 'Sheathing', price: '18.40', uom: 'SHT', onhand: 624, stock: 'in' },
  { code: 'LVL-11875', desc: 'LVL 1¾×11⅞ × 16′', category: 'Engineered Wood', price: '92.10', uom: 'EA', onhand: 32, stock: 'low' },
  { code: 'TYVK-HW9', desc: 'Tyvek HomeWrap 9×100', category: 'Weather Barrier', price: '164.00', uom: 'ROL', onhand: 0, stock: 'out' },
  { code: 'CXNAIL-16D', desc: '16d Common Nails · 5lb box', category: 'Fasteners', price: '8.95', uom: 'BOX', onhand: 210, stock: 'in' },
];

// ── Home dashboard fixtures ───────────────────────────────────
export const MOCK_HOME_KPIS = [
  { value: '14', label: 'Open orders', icon: 'clipboard' as const, accentKey: 'green' as const },
  { value: '6', label: 'Open quotes', icon: 'fileText' as const, accentKey: 'draft' as const },
  { value: '23', label: 'Orders today', icon: 'package' as const, accentKey: 'blue' as const, sub: 'across yard' },
];

export const MOCK_RECENT_ORDERS: SalesOrder[] = MOCK_ORDERS.slice(0, 3);

// ── "API" helpers — real API when EXPO_PUBLIC_BACKEND_URL is set, else mock ──
//
// Screens import these names unchanged. In dev mode (no backend URL) they
// return the fixtures above; otherwise they delegate to the Bearer-authed
// client in src/api/sales.ts. This is the single seam between mock and live.
import { IS_DEV_MODE } from '@/api/client';
import { salesApi } from '@/api/sales';
import type { ItemAvailability } from '@/api/sales';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchCustomers(query = ''): Promise<SalesCustomer[]> {
  if (!IS_DEV_MODE) return salesApi.customers(query);
  await wait(250);
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_CUSTOMERS;
  return MOCK_CUSTOMERS.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
  );
}

export async function fetchCustomer(code: string): Promise<SalesCustomer | undefined> {
  if (!IS_DEV_MODE) return (await salesApi.customerDetail(code)).customer;
  await wait(150);
  return MOCK_CUSTOMERS.find((c) => c.code === code);
}

/** Customer profile + its open orders, in one call. */
export async function fetchCustomerDetail(code: string): Promise<{ customer?: SalesCustomer; orders: SalesOrder[] }> {
  if (!IS_DEV_MODE) return salesApi.customerDetail(code);
  await wait(200);
  const customer = MOCK_CUSTOMERS.find((c) => c.code === code);
  return { customer, orders: customer?.openOrders ? MOCK_CUSTOMER_ORDERS : [] };
}

export async function fetchOrders(query = ''): Promise<SalesOrder[]> {
  if (!IS_DEV_MODE) return salesApi.orders(query);
  await wait(250);
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_ORDERS;
  return MOCK_ORDERS.filter(
    (o) => o.so.toLowerCase().includes(q) || o.cust.toLowerCase().includes(q),
  );
}

export async function fetchOrder(so: string): Promise<SalesOrder | undefined> {
  if (!IS_DEV_MODE) return salesApi.order(so);
  await wait(150);
  return MOCK_ORDERS.find((o) => o.so === so);
}

export async function fetchItems(query = ''): Promise<SalesItem[]> {
  if (!IS_DEV_MODE) return salesApi.items(query);
  await wait(250);
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_ITEMS;
  return MOCK_ITEMS.filter(
    (i) => i.code.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q),
  );
}

export async function fetchItem(code: string): Promise<SalesItem | undefined> {
  if (!IS_DEV_MODE) return salesApi.item(code);
  await wait(150);
  return MOCK_ITEMS.find((i) => i.code === code);
}

// ── Phase 2: live price/availability overlays (no-op in dev mode) ──
export async function fetchItemAvailability(code: string): Promise<ItemAvailability | null> {
  if (IS_DEV_MODE) return null; // only meaningful against the live ERP
  try { return await salesApi.itemAvailability(code); } catch { return null; }
}

export async function fetchItemPrices(codes: string[]): Promise<Record<string, number>> {
  if (IS_DEV_MODE) return {};
  return salesApi.itemPrices(codes);
}
