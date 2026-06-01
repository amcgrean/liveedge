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
  clear: () => void;
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

  const clear = useCallback(() => {
    setCustomerState(null);
    setLines([]);
  }, []);

  return (
    <DraftContext.Provider value={{ customer, lines, setCustomer, addItem, setQty, removeLine, clear }}>
      {children}
    </DraftContext.Provider>
  );
}

export function useDraft(): DraftState {
  const ctx = useContext(DraftContext);
  if (ctx === undefined) throw new Error('useDraft must be used within DraftProvider');
  return ctx;
}
