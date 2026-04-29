// Shared constants and types for the management forecast feature.
// Lives outside the API route module because Next.js disallows non-route
// runtime exports from `app/api/.../route.ts`.

export const BRANCHES = ['10FD', '20GR', '25BW', '40CV'] as const;
export type Branch = typeof BRANCHES[number];

export interface OpenOrderRow {
  sale_type: string;
  /** Branch code → open SO count */
  by_branch: Partial<Record<Branch, number>>;
  total: number;
}

export interface ForecastDayRow {
  date: string;
  total: number;
  by_branch: Partial<Record<Branch, number>>;
  by_ship_via: Record<string, number>;
}

export interface ForecastPayload {
  branches: readonly Branch[];
  ship_vias: string[];
  open_orders: {
    rows: OpenOrderRow[];
    branch_totals: Partial<Record<Branch, number>>;
    grand_total: number;
  };
  forecast: {
    days: ForecastDayRow[];
    branch_totals: Partial<Record<Branch, number>>;
    ship_via_totals: Record<string, number>;
    grand_total: number;
  };
  forecast_days: number;
}
