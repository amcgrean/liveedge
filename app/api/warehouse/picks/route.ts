import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface OpenPickSummary {
  so_number: string;
  customer_name: string;
  reference: string | null;
  so_status: string;
  handling_codes: string[];    // distinct handling codes on this SO
  system_id: string;
  expect_date: string | null;
  sale_type: string | null;
  ship_via: string | null;
  driver: string | null;
  route: string | null;
  line_count: number;
  printed_at: string | null;
  staged_at: string | null;
}

// GET /api/warehouse/picks?branch=20GR&limit=100
// Returns open picks (distinct SOs) from ERP mirror tables.
// Mirrors WH-Tracker's get_open_so_summary logic.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const branchParam = searchParams.get('branch') ?? '';
  const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '200', 10) || 200);

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  // Determine branch filter: non-admin users are locked to their branch
  const effectiveBranch = isAdmin ? (branchParam || null) : (session.user.branch || null);

  try {
    const sql = getErpSql();

    type RawRow = {
      so_id: string;
      cust_name: string | null;
      reference: string | null;
      so_status: string | null;
      handling_code: string | null;
      system_id: string;
      expect_date: string | null;
      sale_type: string | null;
      ship_via: string | null;
      driver: string | null;
      route_id_char: string | null;
      line_count: number;
      pick_printed_date: string | null;
      pick_printed_time: string | null;
      loaded_date: string | null;
      loaded_time: string | null;
    };

    // Conditional branch filter — avoids duplicating the entire query
    const branchFilter = effectiveBranch
      ? sql`AND soh.system_id = ${effectiveBranch}`
      : sql``;

    // We select per SO+handling_code row and collapse client-side.
    // The query mirrors WH-Tracker's get_open_picks central_db_mode path.
    const rows = await sql<RawRow[]>`
      WITH shipment_rollup AS (
        SELECT sh.system_id, sh.so_id,
          MAX(sh.status_flag)   AS status_flag,
          MAX(sh.invoice_date)  AS invoice_date,
          MAX(sh.ship_date)     AS ship_date,
          MAX(sh.ship_via)      AS ship_via,
          MAX(sh.driver)        AS driver,
          MAX(sh.route_id_char) AS route_id_char,
          MAX(sh.loaded_time)   AS loaded_time,
          MAX(sh.loaded_date)   AS loaded_date
        FROM agility_shipments sh
        WHERE sh.is_deleted = false
        GROUP BY sh.system_id, sh.so_id
      ),
      pick_rollup AS (
        SELECT system_id, tran_id AS so_id,
          MAX(created_date) AS created_date,
          MAX(created_time) AS created_time
        FROM agility_picks
        WHERE is_deleted = false
          AND UPPER(COALESCE(print_status, '')) = 'PICK TICKET'
          AND UPPER(COALESCE(tran_type, '')) = 'SO'
          AND created_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY system_id, tran_id
      )
      SELECT
        soh.so_id,
        soh.cust_name,
        soh.reference,
        soh.so_status,
        UPPER(COALESCE(sol.handling_code, 'UNROUTED')) AS handling_code,
        soh.system_id,
        soh.expect_date::text         AS expect_date,
        soh.sale_type,
        sh.ship_via,
        sh.driver,
        sh.route_id_char,
        COUNT(sol.id)                 AS line_count,
        pr.created_date::text         AS pick_printed_date,
        pr.created_time               AS pick_printed_time,
        sh.loaded_date::text          AS loaded_date,
        sh.loaded_time
      FROM agility_so_lines sol
      JOIN agility_so_header soh
        ON soh.system_id = sol.system_id AND soh.so_id = sol.so_id
      LEFT JOIN shipment_rollup sh
        ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
      LEFT JOIN pick_rollup pr
        ON pr.system_id = soh.system_id AND pr.so_id = soh.so_id
      WHERE soh.is_deleted = false
        AND sol.is_deleted = false
        ${branchFilter}
        AND UPPER(COALESCE(soh.so_status, '')) != 'C'
        AND (
          UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
          OR (UPPER(COALESCE(soh.so_status, '')) = 'I' AND CAST(sh.invoice_date AS DATE) = CURRENT_DATE)
          OR CAST(soh.expect_date AS DATE) = CURRENT_DATE
        )
        AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
      GROUP BY soh.system_id, soh.so_id, soh.cust_name, soh.reference, soh.so_status,
        UPPER(COALESCE(sol.handling_code, 'UNROUTED')), soh.expect_date, soh.sale_type,
        sh.ship_via, sh.driver, sh.route_id_char, pr.created_date, pr.created_time,
        sh.loaded_date, sh.loaded_time
      ORDER BY soh.system_id, soh.so_id
      LIMIT ${limit}
    `;

    // Collapse rows to one per SO, collecting handling codes
    const soMap = new Map<string, OpenPickSummary>();
    for (const r of rows) {
      const key = `${r.system_id}|${r.so_id}`;
      const existing = soMap.get(key);
      const code = r.handling_code ?? 'UNROUTED';
      if (existing) {
        if (!existing.handling_codes.includes(code)) existing.handling_codes.push(code);
        existing.line_count += Number(r.line_count);
      } else {
        soMap.set(key, {
          so_number: r.so_id,
          customer_name: r.cust_name ?? 'Unknown',
          reference: r.reference ?? null,
          so_status: r.so_status ?? '',
          handling_codes: [code],
          system_id: r.system_id,
          expect_date: r.expect_date ?? null,
          sale_type: r.sale_type ?? null,
          ship_via: r.ship_via ?? null,
          driver: r.driver ?? null,
          route: r.route_id_char ?? null,
          line_count: Number(r.line_count),
          printed_at: r.pick_printed_date
            ? `${r.pick_printed_date}${r.pick_printed_time ? ' ' + r.pick_printed_time : ''}`
            : null,
          staged_at: r.loaded_date
            ? `${r.loaded_date}${r.loaded_time ? ' ' + r.loaded_time : ''}`
            : null,
        });
      }
    }

    return NextResponse.json(Array.from(soMap.values()));
  } catch (err) {
    console.error('[warehouse/picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
