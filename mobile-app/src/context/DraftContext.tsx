import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { SalesCustomer, SalesItem } from '@/data/salesMock';

// A line on an in-progress quote/order draft. `price` is the per-UOM unit price
// as a display string (may be '—' when no live price); the server ignores it
// and applies the customer pricing matrix on write.
export interface DraftLine {
  code: string;
  desc: string;
  uom: string;
  price: string;
  qty: number;
}

export interface DraftCustomer {
  code: string;
  name: string;
  city: string;
  mono: string;
  tone: string;
}

interface DraftState {
  customer: DraftCustomer | null;
  lines: DraftLine[];
  setCustomer: (c: SalesCustomer) => void;
  addItem: (it: SalesItem, qty?: number) => void;
  setQty: (code: string, qty: number) => void;
  removeLine: (code: string) => void;
  /** Replace the whole draft at once (e.g. copy-to-quote from an order). */
  seed: (customer: DraftCustomer | null, lines: DraftLine[]) => void;
  clear: () => void;
}

// Build the monogram + a stable accent from a name (matches the API mapper).
const SEED_TONES = ['#006834', '#2563eb', '#d97706', '#475569', '#0a8a4a'];
export function monogramFor(name: string): string {
  if (!name) return '··';
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
export function toneFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SEED_TONES[h % SEED_TONES.length];
}

const DraftContext = createContext<DraftState | undefined>(undefined);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<DraftCustomer | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);

  const setCustomer = useCallback((c: SalesCustomer) => {
    setCustomerState({ code: c.code, name: c.name, city: c.city, mono: c.mono, tone: c.tone });
  }, []);

  const addItem = useCallback((it: SalesItem, qty = 1) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.code === it.code);
      if (existing) {
        return ls.map((l) => (l.code === it.code ? { ...l, qty: l.qty + qty } : l));
      }
      return [...ls, { code: it.code, desc: it.desc, uom: it.uom, price: it.price, qty }];
    });
  }, []);

  const setQty = useCallback((code: string, qty: number) => {
    setLines((ls) => ls.map((l) => (l.code === code ? { ...l, qty: Math.max(1, qty) } : l)));
  }, []);

  const removeLine = useCallback((code: string) => {
    setLines((ls) => ls.filter((l) => l.code !== code));
  }, []);

  const seed = useCallback((c: DraftCustomer | null, ls: DraftLine[]) => {
    setCustomerState(c);
    setLines(ls);
  }, []);

  const clear = useCallback(() => {
    setCustomerState(null);
    setLines([]);
  }, []);

  return (
    <DraftContext.Provider value={{ customer, lines, setCustomer, addItem, setQty, removeLine, seed, clear }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft(): DraftState {
  const ctx = useContext(DraftContext);
  if (ctx === undefined) throw new Error('useDraft must be used within DraftProvider');
  return ctx;
}
