import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface DeliveryReportRow {
  ship_date: string;
  system_id: string;
  so_id: string;
  sale_type: string | null;
  ship_via: string | null;
  line_count: number;
}

/** A (date, branch) cell with the count of distinct SOs shipped that day. */
export interface DailyBranchCell {
  date: string;
  system_id: string;
  count: number;
}

export interface DeliveryReportPayload {
  window: string;
  sale_type: string;
  /** All ship dates in the window (YYYY-MM-DD), sorted asc — including zero-volume days. */
  active_dates: string[];
  /** Per-day total deliveries (across all branches matching the filter). */
  by_date: { date: string; count: number }[];
  /** Per-day per-branch deliveries — used to compute daily avg/high/low per branch. */
  by_date_branch: DailyBranchCell[];
  by_sale_type: { sale_type: string; count: number }[];
  /** sale_type × branch counts — flat rows for client-side pivoting into a heatmap. */
  by_sale_type_branch: { sale_type: string; system_id: string; count: number }[];
  by_ship_via:  { ship_via: string;  count: number }[];
  detail: DeliveryReportRow[];
}

// GET /api/ops/delivery-reporting?sale_type=all&window=30d&branch=
//
// Fulfilled deliveries (excludes will-calls, directs, install-only, hold) over
// a rolling window. Returns per-day-per-branch counts so the client can compute
// daily averages, highs, and lows — the metrics ops actually cares about.
// Saturday inclusion is a client-side toggle since most metrics differ
// dramatically when Saturdays are mixed in (low-volume delivery days).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canAccess =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const saleTypeParam = searchParams.get('sale_type') ?? 'all';
  const windowParam = searchParams.get('window') ?? '30d';
  const branchParam = searchParams.get('branch') ?? '';
  const detailLimit = Math.min(500, parseInt(searchParams.get('detail_limit') ?? '250', 10) || 250);

  const windowDays = windowParam === '7d' ? 7 : windowParam === '90d' ? 90 : 30;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  const saleTypeFilter = saleTypeParam !== 'all' ? saleTypeParam.toUpperCase() : null;

  try {
    const sql = getErpSql();

    type ResultRow = {
      result: {
        by_date:             { date: string; count: number }[]                                | null;
        by_date_branch:      DailyBranchCell[]                                                | null;
        by_sale_type:        { sale_type: string; count: number }[]                           | null;
        by_sale_type_branch: { sale_type: string; system_id: string; count: number }[]        | null;
        by_ship_via:         { ship_via: string;  count: number }[]                           | null;
        detail:              DeliveryReportRow[]                                              | null;
      };
    };

    const rows = await sql<ResultRow[]>`
      WITH filtered AS (
        SELECT
          soh.so_id,
          soh.system_id,
          CAST(sh.ship_date AS DATE)            AS ship_date,
          UPPER(COALESCE(soh.sale_type, ''))    AS sale_type_norm,
          COALESCE(soh.sale_type, 'Unknown')    AS sale_type_raw,
          COALESCE(sh.ship_via, soh.ship_via, 'Unknown') AS ship_via
        FROM agility_shipments sh
        JOIN agility_so_header soh
          ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
        WHERE soh.is_deleted = false
          AND CAST(sh.ship_date AS DATE) >= ${since}::date
          AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
          ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
          ${saleTypeFilter ? sql`AND UPPER(COALESCE(soh.sale_type, '')) = ${saleTypeFilter}` : sql``}
      ),
      uniq AS (
        SELECT DISTINCT system_id, so_id, ship_date, sale_type_raw, ship_via FROM filtered
      ),
      detail_window AS (
        SELECT
          system_id, so_id, ship_date, sale_type_raw AS sale_type, ship_via,
          COALESCE((
            SELECT COUNT(*)::int
            FROM agility_so_lines sol
            WHERE sol.system_id = uniq.system_id
              AND sol.so_id     = uniq.so_id
              AND sol.is_deleted = false
          ), 0) AS line_count
        FROM uniq
        ORDER BY ship_date DESC, so_id DESC
        LIMIT ${detailLimit}
      )
      SELECT json_build_object(
        'by_date', (
          SELECT COALESCE(json_agg(d ORDER BY d.date ASC), '[]'::json)
          FROM (
            SELECT ship_date::text AS date, COUNT(*)::int AS count
            FROM uniq GROUP BY ship_date
          ) d
        ),
        'by_date_branch', (
          SELECT COALESCE(json_agg(d ORDER BY d.date ASC, d.system_id ASC), '[]'::json)
          FROM (
            SELECT ship_date::text AS date, system_id, COUNT(*)::int AS count
            FROM uniq GROUP BY ship_date, system_id
          ) d
        ),
        'by_sale_type', (
          SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
          FROM (
            SELECT sale_type_raw AS sale_type, COUNT(*)::int AS count
            FROM uniq GROUP BY sale_type_raw
          ) s
        ),
        'by_sale_type_branch', (
          SELECT COALESCE(json_agg(s ORDER BY s.sale_type ASC, s.system_id ASC), '[]'::json)
          FROM (
            SELECT sale_type_raw AS sale_type, system_id, COUNT(*)::int AS count
            FROM uniq GROUP BY sale_type_raw, system_id
          ) s
        ),
        'by_ship_via', (
          SELECT COALESCE(json_agg(s ORDER BY s.count DESC), '[]'::json)
          FROM (
            SELECT ship_via, COUNT(*)::int AS count
            FROM uniq GROUP BY ship_via
            ORDER BY COUNT(*) DESC LIMIT 20
          ) s
        ),
        'detail', (
          SELECT COALESCE(json_agg(json_build_object(
            'ship_date',  ship_date::text,
            'system_id',  system_id,
            'so_id',      so_id::text,
            'sale_type',  sale_type,
            'ship_via',   ship_via,
            'line_count', line_count
          )), '[]'::json)
          FROM detail_window
        )
      ) AS result
    `;

    const r = rows[0]?.result ?? {
      by_date: [], by_date_branch: [], by_sale_type: [], by_sale_type_branch: [], by_ship_via: [], detail: [],
    };
    const byDate = r.by_date ?? [];

    const payload: DeliveryReportPayload = {
      window: windowParam,
      sale_type: saleTypeParam,
      active_dates: byDate.map((d) => d.date),
      by_date: byDate,
      by_date_branch: r.by_date_branch ?? [],
      by_sale_type: r.by_sale_type ?? [],
      by_sale_type_branch: r.by_sale_type_branch ?? [],
      by_ship_via: r.by_ship_via ?? [],
      detail: r.detail ?? [],
    };

    const res = NextResponse.json(payload);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[ops/delivery-reporting GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
