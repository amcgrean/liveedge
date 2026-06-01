// Shared helpers for the Sales mobile WRITE endpoints (quote/order create,
// quote release). These hit the live Agility API — see the data-source policy
// in docs/agent-prompts/sales-mobile-phased-plan.md.
//
// SAFETY: every write is gated behind SALES_MOBILE_WRITEBACK_MODE so the routes
// can ship inert and be flipped on only after a test-env validation pass
// (mirrors the proven HUBBELL_AGILITY_WRITEBACK_MODE pattern). Until the flag
// is 'test' or 'prod', the routes return 200 with {written:false} and never
// touch Agility.

import { BRANCH_MAP } from '../../../../src/lib/agility-api';

export type WritebackMode = 'disabled' | 'test' | 'prod';

/** Resolve the writeback mode from env. Default disabled (safe). */
export function writebackMode(): WritebackMode {
  const m = (process.env.SALES_MOBILE_WRITEBACK_MODE ?? '').toLowerCase();
  return m === 'test' || m === 'prod' ? m : 'disabled';
}

/** Whether a given mode actually performs a live write. */
export function isWriteEnabled(mode: WritebackMode): mode is 'test' | 'prod' {
  return mode === 'test' || mode === 'prod';
}

/** Agility call options derived from the mode + a Beisser branch code. */
export function agilityOptions(mode: WritebackMode, branchCode: string): { branch?: string; useTest?: boolean } {
  const branch = branchCode ? (BRANCH_MAP[branchCode] ?? branchCode) : undefined;
  return { branch, useTest: mode === 'test' };
}

// ── Request body shapes (mobile draft → route) ──
export interface WriteLine {
  itemId: string;
  quantity: number;
  uom: string;
}

export interface QuoteCreateBody {
  customer: string;          // Agility CustomerID
  branch?: string;           // branch.all users may target a branch
  shipToSequence?: number;
  saleType?: string;         // defaults to DELIVERY
  reference?: string;
  expirationDate?: string;   // yyyy-mm-dd
  notes?: string;
  lines: WriteLine[];
}

export interface OrderCreateBody extends QuoteCreateBody {
  expectDate?: string;       // yyyy-mm-dd
  poNumber?: string;
  validate?: boolean;        // run SalesOrderCreateValidate first
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate + normalize a write body. Returns either an error string (caller
 * returns 400) or the cleaned fields. Price is intentionally NOT accepted from
 * the client — Agility applies the customer pricing matrix (same as push-to-erp).
 */
export function normalizeWriteBody(
  body: Partial<OrderCreateBody> | undefined,
): { error: string } | {
  customer: string;
  shipToSequence: number;
  saleType: string;
  reference: string;
  notes: string;
  expectDate?: string;
  expirationDate?: string;
  poNumber?: string;
  validate: boolean;
  lines: { ItemID: string; Quantity: number; UOM: string }[];
} {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' };
  const customer = String(body.customer ?? '').trim();
  if (!customer) return { error: 'customer (Agility CustomerID) is required' };

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return { error: 'at least one line item is required' };
  }
  const lines = [];
  for (const l of body.lines) {
    const itemId = String(l?.itemId ?? '').trim();
    const quantity = Number(l?.quantity);
    const uom = String(l?.uom ?? '').trim();
    if (!itemId || !uom || !Number.isFinite(quantity) || quantity <= 0) {
      return { error: `invalid line item: ${JSON.stringify(l)}` };
    }
    lines.push({ ItemID: itemId, Quantity: quantity, UOM: uom });
  }
  if (lines.length > 200) return { error: 'maximum 200 line items per write' };

  if (body.expectDate && !DATE_RE.test(body.expectDate)) return { error: 'expectDate must be yyyy-mm-dd' };
  if (body.expirationDate && !DATE_RE.test(body.expirationDate)) return { error: 'expirationDate must be yyyy-mm-dd' };

  return {
    customer,
    shipToSequence: Number.isFinite(Number(body.shipToSequence)) ? Number(body.shipToSequence) : 1,
    saleType: String(body.saleType ?? 'DELIVERY').trim() || 'DELIVERY',
    reference: String(body.reference ?? '').trim(),
    notes: String(body.notes ?? '').trim(),
    expectDate: body.expectDate,
    expirationDate: body.expirationDate,
    poNumber: body.poNumber ? String(body.poNumber).trim() : undefined,
    validate: body.validate === true,
    lines,
  };
}
