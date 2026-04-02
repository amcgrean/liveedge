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

    // We select per SO+handling_code row and collapse client-side.
    // The query mirrors WH-Tracker's get_open_picks central_db_mode path.
    const rows = effectiveBranch
      ? await sql<RawRow[]>`
          WITH shipment_rollup AS (
            SELECT sh.system_id, sh.so_id,
              MAX(sh.status_flag)           AS status_flag,
              MAX(sh.invoice_date)          AS invoice_date,
              MAX(sh.ship_date)             AS ship_date,
              MAX(sh.ship_via)              AS ship_via,
              MAX(sh.driver)                AS driver,
              MAX(sh.route_id_char)         AS route_id_char,
              MAX(sh.loaded_time)           AS loaded_time,
              MAX(sh.loaded_date)           AS loaded_date
            FROM erp_mirror_shipments_header sh
            WHERE sh.is_deleted = false
            GROUP BY sh.system_id, sh.so_id
          ),
          pick_rollup AS (
            SELECT pd.system_id, pd.tran_id AS so_id,
              MAX(ph.created_date) AS created_date,
              MAX(ph.created_time) AS created_time
            FROM erp_mirror_pick_header ph
            JOIN erp_mirror_pick_detail pd
              ON ph.pick_id = pd.pick_id AND ph.system_id = pd.system_id
            WHERE ph.is_deleted = false AND pd.is_deleted = false
              AND UPPER(COALESCE(ph.print_status, '')) = 'PICK TICKET'
              AND UPPER(COALESCE(pd.tran_type, '')) = 'SO'
              AND ph.created_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY pd.system_id, pd.tran_id
          )
          SELECT
            soh.so_id,
            c.cust_name,
            soh.reference,
            soh.so_status,
            UPPER(COALESCE(ib.handling_code, 'UNROUTED')) AS handling_code,
            soh.system_id,
            soh.expect_date::text              AS expect_date,
            soh.sale_type,
            sh.ship_via,
            sh.driver,
            sh.route_id_char,
            COUNT(sod.id)                      AS line_count,
            pr.created_date::text              AS pick_printed_date,
            pr.created_time                    AS pick_printed_time,
            sh.loaded_date::text               AS loaded_date,
            sh.loaded_time
          FROM erp_mirror_so_detail sod
          JOIN erp_mirror_so_header soh
            ON soh.system_id = sod.system_id AND soh.so_id = sod.so_id
          LEFT JOIN erp_mirror_item_branch ib
            ON ib.system_id = sod.system_id AND ib.item_ptr = sod.item_ptr AND ib.is_deleted = false
          LEFT JOIN erp_mirror_cust c
            ON TRIM(c.cust_key) = TRIM(soh.cust_key)
          LEFT JOIN shipment_rollup sh
            ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
          LEFT JOIN pick_rollup pr
            ON pr.system_id = soh.system_id AND pr.so_id = soh.so_id
          WHERE soh.is_deleted = false
            AND sod.is_deleted = false
            AND soh.system_id = ${effectiveBranch}
            AND UPPER(COALESCE(soh.so_status, '')) != 'C'
            AND (
              UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
              OR (UPPER(COALESCE(soh.so_status, '')) = 'I' AND CAST(sh.invoice_date AS DATE) = CURRENT_DATE)
              OR CAST(soh.expect_date AS DATE) = CURRENT_DATE
            )
            AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
          GROUP BY soh.system_id, soh.so_id, c.cust_name, soh.reference, soh.so_status,
            UPPER(COALESCE(ib.handling_code, 'UNROUTED')), soh.expect_date, soh.sale_type,
            sh.ship_via, sh.driver, sh.route_id_char, pr.created_date, pr.created_time,
            sh.loaded_date, sh.loaded_time
          ORDER BY soh.so_id
          LIMIT ${limit}
        `
      : await sql<RawRow[]>`
          WITH shipment_rollup AS (
            SELECT sh.system_id, sh.so_id,
              MAX(sh.status_flag)  AS status_flag,
              MAX(sh.invoice_date) AS invoice_date,
              MAX(sh.ship_date)    AS ship_date,
              MAX(sh.ship_via)     AS ship_via,
              MAX(sh.driver)       AS driver,
              MAX(sh.route_id_char) AS route_id_char,
              MAX(sh.loaded_time)  AS loaded_time,
              MAX(sh.loaded_date)  AS loaded_date
            FROM erp_mirror_shipments_header sh
            WHERE sh.is_deleted = false
            GROUP BY sh.system_id, sh.so_id
          ),
          pick_rollup AS (
            SELECT pd.system_id, pd.tran_id AS so_id,
              MAX(ph.created_date) AS created_date,
              MAX(ph.created_time) AS created_time
            FROM erp_mirror_pick_header ph
            JOIN erp_mirror_pick_detail pd
              ON ph.pick_id = pd.pick_id AND ph.system_id = pd.system_id
            WHERE ph.is_deleted = false AND pd.is_deleted = false
              AND UPPER(COALESCE(ph.print_status, '')) = 'PICK TICKET'
              AND UPPER(COALESCE(pd.tran_type, '')) = 'SO'
              AND ph.created_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY pd.system_id, pd.tran_id
          )
          SELECT
            soh.so_id,
            c.cust_name,
            soh.reference,
            soh.so_status,
            UPPER(COALESCE(ib.handling_code, 'UNROUTED')) AS handling_code,
            soh.system_id,
            soh.expect_date::text AS expect_date,
            soh.sale_type,
            sh.ship_via,
            sh.driver,
            sh.route_id_char,
            COUNT(sod.id) AS line_count,
            pr.created_date::text AS pick_printed_date,
            pr.created_time AS pick_printed_time,
            sh.loaded_date::text AS loaded_date,
            sh.loaded_time
          FROM erp_mirror_so_detail sod
          JOIN erp_mirror_so_header soh
            ON soh.system_id = sod.system_id AND soh.so_id = sod.so_id
          LEFT JOIN erp_mirror_item_branch ib
            ON ib.system_id = sod.system_id AND ib.item_ptr = sod.item_ptr AND ib.is_deleted = false
          LEFT JOIN erp_mirror_cust c
            ON TRIM(c.cust_key) = TRIM(soh.cust_key)
          LEFT JOIN shipment_rollup sh
            ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
          LEFT JOIN pick_rollup pr
            ON pr.system_id = soh.system_id AND pr.so_id = soh.so_id
          WHERE soh.is_deleted = false
            AND sod.is_deleted = false
            AND UPPER(COALESCE(soh.so_status, '')) != 'C'
            AND (
              UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
              OR (UPPER(COALESCE(soh.so_status, '')) = 'I' AND CAST(sh.invoice_date AS DATE) = CURRENT_DATE)
              OR CAST(soh.expect_date AS DATE) = CURRENT_DATE
            )
            AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
          GROUP BY soh.system_id, soh.so_id, c.cust_name, soh.reference, soh.so_status,
            UPPER(COALESCE(ib.handling_code, 'UNROUTED')), soh.expect_date, soh.sale_type,
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
