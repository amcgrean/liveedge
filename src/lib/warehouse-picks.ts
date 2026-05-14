import { getErpSql } from '../../db/supabase';

export interface OpenPickSummary {
  so_number: string;
  customer_name: string;
  customer_code: string | null;
  reference: string | null;
  primary_item_code: string | null;
  so_status: string;
  handling_codes: string[];
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

export async function fetchOpenPickSummaries(
  effectiveBranch: string | null,
  limit = 200
): Promise<OpenPickSummary[]> {
  const sql = getErpSql();
  const safeLimit = Math.min(500, Math.max(1, limit));
  const branchFilter = effectiveBranch
    ? sql`AND soh.system_id = ${effectiveBranch}`
    : sql``;

  type RawRow = {
    so_id: string;
    cust_name: string | null;
    cust_code: string | null;
    reference: string | null;
    so_status: string | null;
    system_id: string;
    expect_date: string | null;
    sale_type: string | null;
    handling_codes: string[] | null;
    primary_item_code: string | null;
    line_count: number;
    ship_via: string | null;
    driver: string | null;
    route_id_char: string | null;
    loaded_date: string | null;
    pick_printed_date: string | null;
  };

  const rows = await sql<RawRow[]>`
    WITH eligible_so AS (
      SELECT
        soh.system_id,
        soh.so_id,
        soh.cust_name,
        soh.cust_code,
        soh.reference,
        soh.so_status,
        soh.expect_date::text AS expect_date,
        soh.sale_type
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        ${branchFilter}
        AND UPPER(COALESCE(soh.so_status, '')) <> 'C'
        AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
        AND (
          UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
          OR (
            UPPER(COALESCE(soh.so_status, '')) = 'I'
            AND EXISTS (
              SELECT 1
              FROM agility_shipments sh
              WHERE sh.is_deleted = false
                AND sh.system_id = soh.system_id
                AND sh.so_id = soh.so_id
                AND sh.invoice_date::date = (NOW() AT TIME ZONE 'America/Chicago')::date
            )
          )
          OR soh.expect_date::date = (NOW() AT TIME ZONE 'America/Chicago')::date
        )
      ORDER BY soh.system_id, soh.so_id
      LIMIT ${safeLimit}
    ),
    line_summary AS (
      SELECT
        sol.system_id,
        sol.so_id,
        ARRAY_AGG(DISTINCT UPPER(COALESCE(sol.handling_code, 'UNROUTED'))) AS handling_codes,
        MIN(NULLIF(BTRIM(sol.item_code), '')) AS primary_item_code,
        COUNT(*)::int AS line_count
      FROM agility_so_lines sol
      JOIN eligible_so eso
        ON eso.system_id = sol.system_id AND eso.so_id = sol.so_id
      WHERE sol.is_deleted = false
      GROUP BY sol.system_id, sol.so_id
    ),
    shipment_rollup AS (
      SELECT
        sh.system_id,
        sh.so_id,
        MAX(sh.ship_via) AS ship_via,
        MAX(sh.driver) AS driver,
        MAX(sh.route_id_char) AS route_id_char,
        MAX(sh.loaded_date)::text AS loaded_date
      FROM agility_shipments sh
      JOIN eligible_so eso
        ON eso.system_id = sh.system_id AND eso.so_id = sh.so_id
      WHERE sh.is_deleted = false
      GROUP BY sh.system_id, sh.so_id
    ),
    pick_rollup AS (
      SELECT
        p.system_id,
        p.tran_id::text AS so_id,
        MAX(p.created_date)::text AS pick_printed_date
      FROM agility_picks p
      JOIN eligible_so eso
        ON eso.system_id = p.system_id AND eso.so_id = p.tran_id::text
      WHERE p.is_deleted = false
        AND UPPER(COALESCE(p.print_status, '')) = 'PICK TICKET'
        AND UPPER(COALESCE(p.tran_type, '')) = 'SO'
        AND p.created_date >= (NOW() AT TIME ZONE 'America/Chicago')::date - INTERVAL '30 days'
      GROUP BY p.system_id, p.tran_id
    )
    SELECT
      eso.so_id,
      eso.cust_name,
      eso.cust_code,
      eso.reference,
      eso.so_status,
      eso.system_id,
      eso.expect_date,
      eso.sale_type,
      ls.handling_codes,
      ls.primary_item_code,
      ls.line_count,
      sh.ship_via,
      sh.driver,
      sh.route_id_char,
      sh.loaded_date,
      pr.pick_printed_date
    FROM eligible_so eso
    JOIN line_summary ls
      ON ls.system_id = eso.system_id AND ls.so_id = eso.so_id
    LEFT JOIN shipment_rollup sh
      ON sh.system_id = eso.system_id AND sh.so_id = eso.so_id
    LEFT JOIN pick_rollup pr
      ON pr.system_id = eso.system_id AND pr.so_id = eso.so_id
    ORDER BY eso.system_id, eso.so_id
  `;

  return rows.map((row) => ({
    so_number: row.so_id,
    customer_name: row.cust_name ?? 'Unknown',
    customer_code: row.cust_code?.trim() ? row.cust_code.trim() : null,
    reference: row.reference ?? null,
    primary_item_code: row.primary_item_code?.trim() ? row.primary_item_code.trim() : null,
    so_status: row.so_status ?? '',
    handling_codes: row.handling_codes ?? ['UNROUTED'],
    system_id: row.system_id,
    expect_date: row.expect_date ?? null,
    sale_type: row.sale_type ?? null,
    ship_via: row.ship_via ?? null,
    driver: row.driver ?? null,
    route: row.route_id_char ?? null,
    line_count: Number(row.line_count),
    printed_at: row.pick_printed_date ?? null,
    staged_at: row.loaded_date ?? null,
  }));
}
