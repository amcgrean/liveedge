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

export interface DeliveryReportPayload {
  window: string;
  sale_type: string;
  total: number;
  by_date: { date: string; count: number }[];
  by_sale_type: { sale_type: string; count: number }[];
  by_ship_via: { ship_via: string; count: number }[];
  detail: DeliveryReportRow[];
}

// GET /api/ops/delivery-reporting?sale_type=all&window=30d&branch=
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
  // Compute start date in JS — same pattern as sales/reports to avoid INTERVAL arithmetic
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    type SummaryRow = { grp: string; cnt: number };

    // Parallel queries for summaries + detail.
    // The detail query uses a correlated subquery for line_count instead of
    // a JOIN on agility_so_lines — the JOIN pattern multiplies rows
    // (shipments × lines per SO) before GROUP BY, causing slow scans on
    // large windows.
    const [byDate, bySaleType, byShipVia, detail] = await Promise.all([
      sql<{ ship_date: string; cnt: number }[]>`
        SELECT CAST(sh.ship_date AS DATE)::text AS ship_date, COUNT(DISTINCT soh.so_id) AS cnt
        FROM agility_shipments sh
        JOIN agility_so_header soh ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
        WHERE soh.is_deleted = false
          AND CAST(sh.ship_date AS DATE) >= ${since}::date
          AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
          ${saleTypeParam !== 'all' ? sql`AND UPPER(COALESCE(soh.sale_type,'')) = ${saleTypeParam.toUpperCase()}` : sql``}
          ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
          AND UPPER(COALESCE(soh.sale_type,'')) NOT IN ('DIRECT','WILLCALL','XINSTALL','HOLD')
        GROUP BY CAST(sh.ship_date AS DATE)
        ORDER BY CAST(sh.ship_date AS DATE) ASC
      `,
      sql<SummaryRow[]>`
        SELECT COALESCE(soh.sale_type,'Unknown') AS grp, COUNT(DISTINCT soh.so_id) AS cnt
        FROM agility_shipments sh
        JOIN agility_so_header soh ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
        WHERE soh.is_deleted = false
          AND CAST(sh.ship_date AS DATE) >= ${since}::date
          AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
          ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
          AND UPPER(COALESCE(soh.sale_type,'')) NOT IN ('DIRECT','WILLCALL','XINSTALL','HOLD')
        GROUP BY soh.sale_type
        ORDER BY cnt DESC
      `,
      sql<SummaryRow[]>`
        SELECT COALESCE(sh.ship_via, soh.ship_via, 'Unknown') AS grp, COUNT(DISTINCT soh.so_id) AS cnt
        FROM agility_shipments sh
        JOIN agility_so_header soh ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
        WHERE soh.is_deleted = false
          AND CAST(sh.ship_date AS DATE) >= ${since}::date
          AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
          ${saleTypeParam !== 'all' ? sql`AND UPPER(COALESCE(soh.sale_type,'')) = ${saleTypeParam.toUpperCase()}` : sql``}
          ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
          AND UPPER(COALESCE(soh.sale_type,'')) NOT IN ('DIRECT','WILLCALL','XINSTALL','HOLD')
        GROUP BY COALESCE(sh.ship_via, soh.ship_via, 'Unknown')
        ORDER BY cnt DESC
        LIMIT 20
      `,
      sql<{ ship_date: string; system_id: string; so_id: string; sale_type: string | null; ship_via: string | null; line_count: number }[]>`
        SELECT
          CAST(sh.ship_date AS DATE)::text AS ship_date,
          soh.system_id,
          soh.so_id::text AS so_id,
          soh.sale_type,
          COALESCE(sh.ship_via, soh.ship_via) AS ship_via,
          COALESCE((
            SELECT COUNT(*)::int
            FROM agility_so_lines sol
            WHERE sol.system_id = soh.system_id
              AND sol.so_id = soh.so_id
              AND sol.is_deleted = false
          ), 0) AS line_count
        FROM agility_shipments sh
        JOIN agility_so_header soh ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id
        WHERE soh.is_deleted = false
          AND CAST(sh.ship_date AS DATE) >= ${since}::date
          AND CAST(sh.ship_date AS DATE) <= CURRENT_DATE
          ${saleTypeParam !== 'all' ? sql`AND UPPER(COALESCE(soh.sale_type,'')) = ${saleTypeParam.toUpperCase()}` : sql``}
          ${branchParam ? sql`AND soh.system_id = ${branchParam}` : sql``}
          AND UPPER(COALESCE(soh.sale_type,'')) NOT IN ('DIRECT','WILLCALL','XINSTALL','HOLD')
        ORDER BY CAST(sh.ship_date AS DATE) DESC, soh.so_id DESC
        LIMIT ${detailLimit}
      `,
    ]);

    const total = byDate.reduce((sum, r) => sum + Number(r.cnt), 0);

    const payload: DeliveryReportPayload = {
      window: windowParam,
      sale_type: saleTypeParam,
      total,
      by_date: byDate.map((r) => ({ date: r.ship_date, count: Number(r.cnt) })),
      by_sale_type: bySaleType.map((r) => ({ sale_type: r.grp, count: Number(r.cnt) })),
      by_ship_via: byShipVia.map((r) => ({ ship_via: r.grp, count: Number(r.cnt) })),
      detail: detail.map((r) => ({
        ship_date: r.ship_date,
        system_id: r.system_id,
        so_id: r.so_id,
        sale_type: r.sale_type,
        ship_via: r.ship_via,
        line_count: r.line_count,
      })),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error('[ops/delivery-reporting GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
