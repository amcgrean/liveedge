import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export const BRANCHES = ['10FD', '20GR', '25BW', '40CV'] as const;
export type Branch = typeof BRANCHES[number];

/** A row in the open-orders pivot: one sale type × four branch counts. */
export interface OpenOrderRow {
  sale_type: string;
  /** Branch code → open SO count */
  by_branch: Partial<Record<Branch, number>>;
  total: number;
}

/** A row in the forecast: one day × per-branch and per-ship-via counts. */
export interface ForecastDayRow {
  date: string;
  total: number;
  /** Branch code → SO count expected on this day */
  by_branch: Partial<Record<Branch, number>>;
  /** Ship via code → SO count expected on this day */
  by_ship_via: Record<string, number>;
}

export interface ForecastPayload {
  branches: readonly Branch[];
  /** All ship via codes seen in the forecast window, sorted by total volume desc. */
  ship_vias: string[];
  /** Open orders matrix — INCLUDES will-calls and direct ships. */
  open_orders: {
    rows: OpenOrderRow[];
    branch_totals: Partial<Record<Branch, number>>;
    grand_total: number;
  };
  /** Forecast — EXCLUDES will-calls and direct ships. */
  forecast: {
    days: ForecastDayRow[];
    branch_totals: Partial<Record<Branch, number>>;
    ship_via_totals: Record<string, number>;
    grand_total: number;
  };
  forecast_days: number;
}

// GET /api/management/forecast?days=14&branch=
//
// Backs the /management/forecast page. Returns two unrelated datasets in one
// round-trip (open orders + delivery forecast) since they share the same
// underlying agility_so_header scan.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const canAccess =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) =>
      ['admin', 'supervisor', 'ops', 'sales', 'dispatch', 'management'].includes(r),
    );
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const branch = searchParams.get('branch') ?? '';
  const forecastDays = Math.max(1, Math.min(60, parseInt(searchParams.get('days') ?? '14', 10) || 14));

  try {
    const sql = getErpSql();

    type OpenRow      = { sale_type: string; system_id: string | null; cnt: string };
    type ForecastRow  = { d: string; system_id: string | null; ship_via: string; cnt: string };

    // Two independent queries — kept separate (not merged via JSON) because
    // they hit different status sets and one excludes will-call/direct.
    const [openRows, forecastRows] = await Promise.all([
      sql<OpenRow[]>`
        SELECT
          COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN') AS sale_type,
          system_id,
          COUNT(*)::text AS cnt
        FROM agility_so_header
        WHERE is_deleted = false
          AND UPPER(COALESCE(so_status, '')) NOT IN ('I', 'C', 'X')
          ${branch ? sql`AND system_id = ${branch}` : sql``}
        GROUP BY COALESCE(NULLIF(TRIM(sale_type), ''), 'UNKNOWN'), system_id
      `,
      sql<ForecastRow[]>`
        SELECT
          expect_date::date::text AS d,
          system_id,
          COALESCE(NULLIF(TRIM(ship_via), ''), 'UNKNOWN') AS ship_via,
          COUNT(*)::text AS cnt
        FROM agility_so_header
        WHERE is_deleted = false
          AND UPPER(COALESCE(so_status, '')) NOT IN ('I', 'C', 'X')
          AND UPPER(COALESCE(sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
          AND expect_date IS NOT NULL
          AND expect_date::date >= CURRENT_DATE
          AND expect_date::date <  CURRENT_DATE + ${forecastDays}::int
          ${branch ? sql`AND system_id = ${branch}` : sql``}
        GROUP BY expect_date::date, system_id, COALESCE(NULLIF(TRIM(ship_via), ''), 'UNKNOWN')
        ORDER BY expect_date::date ASC
      `,
    ]);

    // ── Pivot open orders: rows = sale_type, columns = branch ──
    const openMap = new Map<string, OpenOrderRow>();
    const openBranchTotals: Partial<Record<Branch, number>> = {};
    let openGrand = 0;
    for (const r of openRows) {
      const cnt = Number(r.cnt);
      const sys = (r.system_id ?? '') as Branch;
      let row = openMap.get(r.sale_type);
      if (!row) {
        row = { sale_type: r.sale_type, by_branch: {}, total: 0 };
        openMap.set(r.sale_type, row);
      }
      row.by_branch[sys] = (row.by_branch[sys] ?? 0) + cnt;
      row.total += cnt;
      if ((BRANCHES as readonly string[]).includes(sys)) {
        openBranchTotals[sys] = (openBranchTotals[sys] ?? 0) + cnt;
      }
      openGrand += cnt;
    }
    const openOrderRows = Array.from(openMap.values()).sort((a, b) => b.total - a.total);

    // ── Pivot forecast: rows = date, columns = branch + ship_via ──
    const dayMap = new Map<string, ForecastDayRow>();
    const fcBranchTotals: Partial<Record<Branch, number>> = {};
    const fcShipViaTotals: Record<string, number> = {};
    let fcGrand = 0;
    for (const r of forecastRows) {
      const cnt = Number(r.cnt);
      const sys = (r.system_id ?? '') as Branch;
      let row = dayMap.get(r.d);
      if (!row) {
        row = { date: r.d, total: 0, by_branch: {}, by_ship_via: {} };
        dayMap.set(r.d, row);
      }
      row.by_branch[sys] = (row.by_branch[sys] ?? 0) + cnt;
      row.by_ship_via[r.ship_via] = (row.by_ship_via[r.ship_via] ?? 0) + cnt;
      row.total += cnt;
      if ((BRANCHES as readonly string[]).includes(sys)) {
        fcBranchTotals[sys] = (fcBranchTotals[sys] ?? 0) + cnt;
      }
      fcShipViaTotals[r.ship_via] = (fcShipViaTotals[r.ship_via] ?? 0) + cnt;
      fcGrand += cnt;
    }
    const forecastDaysSorted = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const shipVias = Object.entries(fcShipViaTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([k]) => k);

    const payload: ForecastPayload = {
      branches: BRANCHES,
      ship_vias: shipVias,
      open_orders: {
        rows: openOrderRows,
        branch_totals: openBranchTotals,
        grand_total: openGrand,
      },
      forecast: {
        days: forecastDaysSorted,
        branch_totals: fcBranchTotals,
        ship_via_totals: fcShipViaTotals,
        grand_total: fcGrand,
      },
      forecast_days: forecastDays,
    };

    const res = NextResponse.json(payload);
    res.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=600');
    return res;
  } catch (err) {
    console.error('[management/forecast GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
