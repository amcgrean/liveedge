// Shared types + helpers for the Sales mobile API (Bearer-or-cookie auth).
//
// These routes back the Expo Sales app (mobile-app/src/app/(sales)). Per the
// data-source policy (docs/agent-prompts/sales-mobile-phased-plan.md), Phase 1
// reads are MIRROR-backed (agility_*); live Agility price/availability is
// Phase 2. Branch scoping mirrors the rest of /api/sales.

export type MobileOrderStatus =
  | 'open' | 'picking' | 'staged' | 'delivery' | 'invoiced';

/**
 * Map an Agility `so_status` code to the mobile 5-stop lifecycle the design
 * renders. Pipeline order (per the scorecard StatusFunnelBar) is
 * `O/B → K → S → P → D → I`. Phase 2 refines picking/staged/delivery using
 * agility_picks / agility_shipments; Phase 1 derives from the header code only.
 */
export function deriveMobileStatus(soStatus: string | null): MobileOrderStatus {
  switch ((soStatus ?? '').trim().toUpperCase()) {
    case 'I': return 'invoiced';
    case 'D': return 'delivery';
    case 'S':
    case 'P': return 'staged';
    case 'K': return 'picking';
    case 'O':
    case 'B':
    case '':
    default: return 'open';
  }
}

export interface MobileCustomer {
  code: string;
  name: string | null;
  city: string | null;
  state: string | null;
  open_orders: number;
}

export interface MobileOrderSummary {
  so_number: string;
  system_id: string;
  customer_name: string | null;
  customer_code: string | null;
  status: MobileOrderStatus;
  so_status: string;
  total: number | null;
  expect_date: string | null;
  reference: string | null;
  po_number: string | null;
  ship_via: string | null;
  line_count: number;
}

export interface MobileOrderLine {
  sequence: number;
  item: string | null;
  description: string | null;
  qty_ordered: number | null;
  uom: string | null;
  price: number | null;
  extended_price: number | null;
}

export interface MobileTimelineStep {
  key: MobileOrderStatus;
  state: 'done' | 'active' | 'todo';
}

export interface MobileItem {
  code: string;
  description: string | null;
  uom: string | null;
  qty_on_hand: number;
  stock: 'in' | 'out';
  /** Live price is Phase 2 (agilityApi.itemPriceAndAvailability). */
  price: number | null;
}
