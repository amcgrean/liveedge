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
  /** Dollar value computed inline from agility_so_lines (all open statuses) */
  ordered_value: number;
  unshipped_value: number;
}

export interface ForecastDayRow {
  date: string;
  total: number;
  by_branch: Partial<Record<Branch, number>>;
  by_ship_via: Record<string, number>;
  /** Sum of unshipped_value across orders expected this day */
  unshipped_value: number;
}

/** Bucketed-by-time-horizon open orders. Counts and $ both cover all open
 *  statuses (excluding HOLD/XINSTALL/I/C/X). */
export interface HorizonBucket {
  count: number;
  ordered_value: number;
  unshipped_value: number;
  by_branch: Partial<Record<Branch, { count: number; ordered_value: number; unshipped_value: number }>>;
}

export type HorizonKey =
  | 'overdue'
  | 'next_7'
  | 'next_8_30'
  | 'next_31_90'
  | 'next_91_plus'
  | 'far_future'
  | 'unscheduled';

export type HorizonBuckets = Record<HorizonKey, HorizonBucket>;

export interface ForecastKpis {
  open_order_count: number;
  ordered_value: number;
  unshipped_value: number;
  unscheduled_or_far_future_count: number;
  by_branch: Array<{
    branch: Branch;
    count: number;
    ordered_value: number;
    unshipped_value: number;
  }>;
}

export interface FarFutureOrder {
  so_id: string;
  system_id: string;
  cust_name: string | null;
  cust_code: string | null;
  rep_1: string | null;
  expect_date: string | null;
  sale_type: string | null;
  so_status: string | null;
  ordered_value: number;
  unshipped_value: number;
  bucket: 'far_future' | 'unscheduled';
}

export interface ForecastPayload {
  branches: readonly Branch[];
  ship_vias: string[];
  kpis: ForecastKpis;
  horizons: HorizonBuckets;
  far_future_orders: FarFutureOrder[];
  open_orders: {
    rows: OpenOrderRow[];
    branch_totals: Partial<Record<Branch, number>>;
    branch_value_totals: Partial<Record<Branch, { ordered_value: number; unshipped_value: number }>>;
    grand_total: number;
    grand_ordered_value: number;
    grand_unshipped_value: number;
  };
  forecast: {
    days: ForecastDayRow[];
    branch_totals: Partial<Record<Branch, number>>;
    ship_via_totals: Record<string, number>;
    grand_total: number;
    grand_unshipped_value: number;
  };
  forecast_days: number;
}
