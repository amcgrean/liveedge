import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';
import {
  BRANCHES,
  type Branch,
  type ForecastDayRow,
  type ForecastPayload,
  type OpenOrderRow,
  type HorizonBuckets,
  type HorizonBucket,
  type HorizonKey,
  type ForecastKpis,
  type FarFutureOrder,
} from '../../../../src/lib/forecast/types';

// GET /api/management/forecast?days=14&branch=
//
// Backs the /management/forecast page. Returns:
//  - kpis              — open order count + $ totals (overall + per branch)
//  - horizons          — open orders bucketed by time horizon (overdue / 7 / 8-30 / 31-90 / 91+ / far-future / unscheduled)
//  - far_future_orders — top 20 orders with placeholder or missing dates (data-hygiene drill-down)
//  - open_orders       — sale-type × branch pivot with $ alongside counts
//  - forecast          — per-day count + unshipped $ (next `days` days)
//
// $ figures use UOM-aware columns populated upstream by sync-worker PR #32
// (beisser-api repo, 2026-05-14):
//   agility_so_lines.extended_price            = qty_ordered * price / disp_price_conv
//   agility_so_lines.unshipped_extended_price  = (qty_ordered - COALESCE(qty_shipped,0)) * price / disp_price_conv
// The previous naive `qty_ordered * price` math overstated $ 10-100× on lumber
// lines because price is denominated in a UOM (e.g. per-MBF) identified by
// price_uom_ptr — disp_price_conv is the conversion factor to per-unit.
// Covers all open statuses (I/C/X/HOLD/XINSTALL excluded) — same scope as counts.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('branch.all');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const branch = searchParams.get('branch') ?? '';
  const forecastDays = Math.max(1, Math.min(60, parseInt(searchParams.get('days') ?? '14', 10) || 14));

  try {
    const sql = getErpSql();

    type OpenRow      = {
      sale_type: string;
      system_id: string | null;
      cnt: string;
      ordered_value: string;
      unshipped_value: string;
    };
    type ForecastRow  = {
      d: string;
      system_id: string | null;
      ship_via: string;
      cnt: string;
      unshipped_value: string;
    };
    type HorizonRow   = {
      bucket: HorizonKey;
      system_id: string | null;
      cnt: string;
      ordered_value: string;
      unshipped_value: string;
    };
    type FarFutureRow = {
      so_id: string;
      system_id: string;
      cust_name: string | null;
      cust_code: string | null;
      rep_1: string | null;
      expect_date: string | null;
      sale_type: string | null;
      so_status: string | null;
      ordered_value: string;
      unshipped_value: string;
      bucket: 'far_future' | 'unscheduled';
    };

    // Coverage gate: extended_price is populated by an upstream sync worker.
    // While backfill is in progress we hide $ KPIs so partial sums don't get
    // quoted as truth. Threshold of 99% leaves a tiny margin for non-essential
    // rows (e.g. lines without an active item record).
    const [openRows, forecastRows, horizonRows, farFutureRows, coverageRows] = await Promise.all([
      // ── Open orders by sale_type × branch (with $) ────────────────────────
      sql<OpenRow[]>`
        SELECT
          COALESCE(NULLIF(TRIM(soh.sale_type), ''), 'UNKNOWN') AS sale_type,
          soh.system_id,
          COUNT(*)::text AS cnt,
          COALESCE(SUM(v.ordered_value), 0)::text   AS ordered_value,
          COALESCE(SUM(v.unshipped_value), 0)::text AS unshipped_value
        FROM agility_so_header soh
        LEFT JOIN (
          SELECT system_id, so_id,
            SUM(extended_price)                                            AS ordered_value,
            SUM(unshipped_extended_price)                                  AS unshipped_value
          FROM agility_so_lines
          WHERE is_deleted = false
          GROUP BY system_id, so_id
        ) v ON v.so_id = soh.so_id AND v.system_id = soh.system_id
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('HOLD', 'XINSTALL')
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        GROUP BY COALESCE(NULLIF(TRIM(soh.sale_type), ''), 'UNKNOWN'), soh.system_id
      `,
      // ── Daily delivery forecast (with $) ──────────────────────────────────
      sql<ForecastRow[]>`
        SELECT
          soh.expect_date::date::text AS d,
          soh.system_id,
          COALESCE(NULLIF(TRIM(soh.ship_via), ''), 'UNKNOWN') AS ship_via,
          COUNT(*)::text AS cnt,
          COALESCE(SUM(v.unshipped_value), 0)::text AS unshipped_value
        FROM agility_so_header soh
        LEFT JOIN (
          SELECT system_id, so_id,
            SUM(unshipped_extended_price) AS unshipped_value
          FROM agility_so_lines
          WHERE is_deleted = false
          GROUP BY system_id, so_id
        ) v ON v.so_id = soh.so_id AND v.system_id = soh.system_id
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
          AND soh.expect_date IS NOT NULL
          AND soh.expect_date::date >= CURRENT_DATE
          AND soh.expect_date::date <  CURRENT_DATE + ${forecastDays}::int
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        GROUP BY soh.expect_date::date, soh.system_id, COALESCE(NULLIF(TRIM(soh.ship_via), ''), 'UNKNOWN')
        ORDER BY soh.expect_date::date ASC
      `,
      // ── Horizon buckets (all open orders, all dates) ──────────────────────
      sql<HorizonRow[]>`
        SELECT
          CASE
            WHEN soh.expect_date IS NULL                                      THEN 'unscheduled'
            WHEN soh.expect_date::date <  CURRENT_DATE                        THEN 'overdue'
            WHEN soh.expect_date::date <  CURRENT_DATE + 7                    THEN 'next_7'
            WHEN soh.expect_date::date <  CURRENT_DATE + 31                   THEN 'next_8_30'
            WHEN soh.expect_date::date <  CURRENT_DATE + 91                   THEN 'next_31_90'
            WHEN soh.expect_date::date <= CURRENT_DATE + INTERVAL '2 years'   THEN 'next_91_plus'
            ELSE                                                                   'far_future'
          END AS bucket,
          soh.system_id,
          COUNT(*)::text AS cnt,
          COALESCE(SUM(v.ordered_value), 0)::text   AS ordered_value,
          COALESCE(SUM(v.unshipped_value), 0)::text AS unshipped_value
        FROM agility_so_header soh
        LEFT JOIN (
          SELECT system_id, so_id,
            SUM(extended_price)                                            AS ordered_value,
            SUM(unshipped_extended_price)                                  AS unshipped_value
          FROM agility_so_lines
          WHERE is_deleted = false
          GROUP BY system_id, so_id
        ) v ON v.so_id = soh.so_id AND v.system_id = soh.system_id
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('HOLD', 'XINSTALL')
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        GROUP BY bucket, soh.system_id
      `,
      // ── Far-future + unscheduled drill list (top 20 by ordered_value) ─────
      sql<FarFutureRow[]>`
        SELECT
          soh.so_id::text AS so_id,
          soh.system_id,
          COALESCE(NULLIF(TRIM(soh.cust_name), ''), ac.cust_name) AS cust_name,
          soh.cust_code,
          soh.rep_1,
          soh.expect_date::text AS expect_date,
          soh.sale_type,
          soh.so_status,
          COALESCE(v.ordered_value, 0)::text   AS ordered_value,
          COALESCE(v.unshipped_value, 0)::text AS unshipped_value,
          CASE WHEN soh.expect_date IS NULL THEN 'unscheduled' ELSE 'far_future' END AS bucket
        FROM agility_so_header soh
        LEFT JOIN LATERAL (
          SELECT cust_name FROM agility_customers
          WHERE cust_key = soh.cust_key AND is_deleted = false
          LIMIT 1
        ) ac ON true
        LEFT JOIN (
          SELECT system_id, so_id,
            SUM(extended_price)                                            AS ordered_value,
            SUM(unshipped_extended_price)                                  AS unshipped_value
          FROM agility_so_lines
          WHERE is_deleted = false
          GROUP BY system_id, so_id
        ) v ON v.so_id = soh.so_id AND v.system_id = soh.system_id
        WHERE soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('HOLD', 'XINSTALL')
          AND (
            soh.expect_date IS NULL
            OR soh.expect_date::date > CURRENT_DATE + INTERVAL '2 years'
          )
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
        ORDER BY COALESCE(v.ordered_value, 0) DESC, soh.so_id DESC
        LIMIT 20
      `,
      // ── Coverage gate — % of open SO lines with extended_price populated ──
      sql<{ pct: string }[]>`
        SELECT
          COALESCE(
            COUNT(*) FILTER (WHERE sol.extended_price IS NOT NULL) * 100.0
              / NULLIF(COUNT(*), 0),
            0
          )::text AS pct
        FROM agility_so_lines sol
        JOIN agility_so_header soh
          ON soh.so_id = sol.so_id AND soh.system_id = sol.system_id
        WHERE sol.is_deleted = false
          AND soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('HOLD', 'XINSTALL')
          ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
      `,
    ]);

    const dollarsCoveragePct = Number(coverageRows[0]?.pct ?? 0);
    // Coverage gate intentionally always-on as of 2026-05-15. Backfill is
    // ~96% steady-state and the remaining gap is structural (source SO lines
    // with NULL/0 price or qty — comment lines, freight, legacy data — that
    // can never produce an extended_price). The threshold floats just below
    // 0 so the page shows $ unconditionally. `dollars_coverage_pct` is still
    // returned on the payload as an emergency lever: bump this back to e.g.
    // 90 if a sync outage ever drops coverage far enough to materially distort
    // totals, and the banner/hide logic kicks back in without further code.
    const DOLLARS_COVERAGE_THRESHOLD = -1;
    const dollarsReady = dollarsCoveragePct >= DOLLARS_COVERAGE_THRESHOLD;

    // ── Pivot open orders: rows = sale_type, columns = branch ──
    const openMap = new Map<string, OpenOrderRow>();
    const openBranchTotals: Partial<Record<Branch, number>> = {};
    const openBranchValueTotals: Partial<Record<Branch, { ordered_value: number; unshipped_value: number }>> = {};
    let openGrand = 0;
    let openGrandOrdered = 0;
    let openGrandUnshipped = 0;
    for (const r of openRows) {
      const cnt = Number(r.cnt);
      const ord = Number(r.ordered_value);
      const uns = Number(r.unshipped_value);
      const sys = (r.system_id ?? '') as Branch;
      let row = openMap.get(r.sale_type);
      if (!row) {
        row = { sale_type: r.sale_type, by_branch: {}, total: 0, ordered_value: 0, unshipped_value: 0 };
        openMap.set(r.sale_type, row);
      }
      row.by_branch[sys] = (row.by_branch[sys] ?? 0) + cnt;
      row.total += cnt;
      row.ordered_value += ord;
      row.unshipped_value += uns;
      if ((BRANCHES as readonly string[]).includes(sys)) {
        openBranchTotals[sys] = (openBranchTotals[sys] ?? 0) + cnt;
        const bv = openBranchValueTotals[sys] ?? { ordered_value: 0, unshipped_value: 0 };
        bv.ordered_value += ord;
        bv.unshipped_value += uns;
        openBranchValueTotals[sys] = bv;
      }
      openGrand += cnt;
      openGrandOrdered += ord;
      openGrandUnshipped += uns;
    }
    const openOrderRows = Array.from(openMap.values()).sort((a, b) => b.total - a.total);

    // ── Pivot forecast: rows = date, columns = branch + ship_via ──
    const dayMap = new Map<string, ForecastDayRow>();
    const fcBranchTotals: Partial<Record<Branch, number>> = {};
    const fcShipViaTotals: Record<string, number> = {};
    let fcGrand = 0;
    let fcGrandUnshipped = 0;
    for (const r of forecastRows) {
      const cnt = Number(r.cnt);
      const uns = Number(r.unshipped_value);
      const sys = (r.system_id ?? '') as Branch;
      let row = dayMap.get(r.d);
      if (!row) {
        row = { date: r.d, total: 0, by_branch: {}, by_ship_via: {}, unshipped_value: 0 };
        dayMap.set(r.d, row);
      }
      row.by_branch[sys] = (row.by_branch[sys] ?? 0) + cnt;
      row.by_ship_via[r.ship_via] = (row.by_ship_via[r.ship_via] ?? 0) + cnt;
      row.total += cnt;
      row.unshipped_value += uns;
      if ((BRANCHES as readonly string[]).includes(sys)) {
        fcBranchTotals[sys] = (fcBranchTotals[sys] ?? 0) + cnt;
      }
      fcShipViaTotals[r.ship_via] = (fcShipViaTotals[r.ship_via] ?? 0) + cnt;
      fcGrand += cnt;
      fcGrandUnshipped += uns;
    }
    const forecastDaysSorted = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const shipVias = Object.entries(fcShipViaTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([k]) => k);

    // ── Horizon buckets ──
    const emptyBucket = (): HorizonBucket => ({
      count: 0, ordered_value: 0, unshipped_value: 0, by_branch: {},
    });
    const horizons: HorizonBuckets = {
      overdue: emptyBucket(),
      next_7: emptyBucket(),
      next_8_30: emptyBucket(),
      next_31_90: emptyBucket(),
      next_91_plus: emptyBucket(),
      far_future: emptyBucket(),
      unscheduled: emptyBucket(),
    };
    // KPI per-branch rollup (counts cover all open; $ is K-only)
    const kpiByBranch = new Map<Branch, { count: number; ordered_value: number; unshipped_value: number }>();
    let kpiCount = 0;
    let kpiOrdered = 0;
    let kpiUnshipped = 0;
    let kpiUnscheduledOrFarFuture = 0;
    for (const r of horizonRows) {
      const bucket = horizons[r.bucket];
      if (!bucket) continue;
      const cnt = Number(r.cnt);
      const ord = Number(r.ordered_value);
      const uns = Number(r.unshipped_value);
      const sys = (r.system_id ?? '') as Branch;
      bucket.count += cnt;
      bucket.ordered_value += ord;
      bucket.unshipped_value += uns;
      const sub = bucket.by_branch[sys] ?? { count: 0, ordered_value: 0, unshipped_value: 0 };
      sub.count += cnt;
      sub.ordered_value += ord;
      sub.unshipped_value += uns;
      bucket.by_branch[sys] = sub;

      kpiCount += cnt;
      kpiOrdered += ord;
      kpiUnshipped += uns;
      if (r.bucket === 'far_future' || r.bucket === 'unscheduled') {
        kpiUnscheduledOrFarFuture += cnt;
      }
      if ((BRANCHES as readonly string[]).includes(sys)) {
        const prev = kpiByBranch.get(sys) ?? { count: 0, ordered_value: 0, unshipped_value: 0 };
        prev.count += cnt;
        prev.ordered_value += ord;
        prev.unshipped_value += uns;
        kpiByBranch.set(sys, prev);
      }
    }
    const kpis: ForecastKpis = {
      open_order_count: kpiCount,
      ordered_value: kpiOrdered,
      unshipped_value: kpiUnshipped,
      unscheduled_or_far_future_count: kpiUnscheduledOrFarFuture,
      by_branch: BRANCHES
        .filter((b) => kpiByBranch.has(b))
        .map((b) => ({ branch: b, ...kpiByBranch.get(b)! })),
    };

    const farFutureOrders: FarFutureOrder[] = farFutureRows.map((r) => ({
      so_id: r.so_id,
      system_id: r.system_id,
      cust_name: r.cust_name,
      cust_code: r.cust_code,
      rep_1: r.rep_1,
      expect_date: r.expect_date,
      sale_type: r.sale_type,
      so_status: r.so_status,
      ordered_value: Number(r.ordered_value),
      unshipped_value: Number(r.unshipped_value),
      bucket: r.bucket,
    }));

    const payload: ForecastPayload = {
      branches: BRANCHES,
      ship_vias: shipVias,
      kpis,
      horizons,
      far_future_orders: farFutureOrders,
      open_orders: {
        rows: openOrderRows,
        branch_totals: openBranchTotals,
        branch_value_totals: openBranchValueTotals,
        grand_total: openGrand,
        grand_ordered_value: openGrandOrdered,
        grand_unshipped_value: openGrandUnshipped,
      },
      forecast: {
        days: forecastDaysSorted,
        branch_totals: fcBranchTotals,
        ship_via_totals: fcShipViaTotals,
        grand_total: fcGrand,
        grand_unshipped_value: fcGrandUnshipped,
      },
      forecast_days: forecastDays,
      dollars_coverage_pct: dollarsCoveragePct,
      dollars_ready: dollarsReady,
    };

    const res = NextResponse.json(payload);
    res.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
    return res;
  } catch (err) {
    console.error('[management/forecast GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
