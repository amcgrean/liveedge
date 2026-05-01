import { getErpSql } from '../../db/supabase';

export interface BranchStats {
  system_id: string;
  open_picks: number;
  open_work_orders: number;
  handling_breakdown: Record<string, number>;
  updated_at: string;
}

// Fetch open pick order and work order counts per branch.
// Counts by distinct order/WO, never by line.
export async function fetchBranchStats(
  isAdmin: boolean,
  userBranch: string | null | undefined
): Promise<BranchStats[]> {
  const sql = getErpSql();
  const branchLock = !isAdmin && userBranch ? userBranch : null;

  const branchCondition = branchLock
    ? sql`AND soh.system_id = ${branchLock}`
    : sql`AND soh.system_id NOT IN ('', 'SYSTEM')`;

  type PickRollupRow = {
    system_id: string;
    open_picks: number;
    handling_code: string | null;
    handling_count: number | null;
  };

  const pickRows = await sql<PickRollupRow[]>`
    WITH eligible_so AS (
      SELECT soh.system_id, soh.so_id
      FROM agility_so_header soh
      WHERE soh.is_deleted = false
        ${branchCondition}
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
    ),
    line_rollup AS (
      SELECT
        sol.system_id,
        sol.so_id,
        ARRAY_REMOVE(
          ARRAY_AGG(DISTINCT NULLIF(UPPER(COALESCE(sol.handling_code, 'UNROUTED')), 'UNROUTED')),
          NULL
        ) AS handling_codes
      FROM agility_so_lines sol
      JOIN eligible_so eso
        ON eso.system_id = sol.system_id AND eso.so_id = sol.so_id
      WHERE sol.is_deleted = false
      GROUP BY sol.system_id, sol.so_id
    ),
    branch_counts AS (
      SELECT eso.system_id, COUNT(*)::int AS open_picks
      FROM eligible_so eso
      JOIN line_rollup lr
        ON lr.system_id = eso.system_id AND lr.so_id = eso.so_id
      GROUP BY eso.system_id
    ),
    handling_breakdown AS (
      SELECT
        lr.system_id,
        code AS handling_code,
        COUNT(*)::int AS handling_count
      FROM line_rollup lr
      CROSS JOIN LATERAL UNNEST(COALESCE(lr.handling_codes, ARRAY[]::text[])) code
      GROUP BY lr.system_id, code
    )
    SELECT
      bc.system_id,
      bc.open_picks,
      hb.handling_code,
      hb.handling_count
    FROM branch_counts bc
    LEFT JOIN handling_breakdown hb
      ON hb.system_id = bc.system_id
    ORDER BY bc.system_id, hb.handling_code
  `;

  const woBranchCondition = branchLock
    ? sql`AND soh.system_id = ${branchLock}`
    : sql`AND COALESCE(soh.system_id, '') NOT IN ('', 'SYSTEM')`;

  type WoRow = { system_id: string | null; cnt: number };
  const woRows = await sql<WoRow[]>`
    SELECT soh.system_id, COUNT(DISTINCT wh.wo_id)::int AS cnt
    FROM agility_wo_header wh
    LEFT JOIN agility_so_header soh
      ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
    WHERE wh.is_deleted = false
      AND UPPER(COALESCE(wh.wo_status, '')) NOT IN ('COMPLETED', 'CANCELED', 'C')
      ${woBranchCondition}
    GROUP BY soh.system_id
  `;

  const now = new Date().toISOString();
  const branchMap = new Map<string, BranchStats>();

  for (const row of pickRows) {
    const existing = branchMap.get(row.system_id);
    if (!existing) {
      branchMap.set(row.system_id, {
        system_id: row.system_id,
        open_picks: row.open_picks,
        open_work_orders: 0,
        handling_breakdown: {},
        updated_at: now,
      });
    }

    if (row.handling_code) {
      branchMap.get(row.system_id)!.handling_breakdown[row.handling_code] = row.handling_count ?? 0;
    }
  }

  for (const row of woRows) {
    if (!row.system_id) continue;
    const existing = branchMap.get(row.system_id);
    if (existing) {
      existing.open_work_orders = row.cnt;
    } else {
      branchMap.set(row.system_id, {
        system_id: row.system_id,
        open_picks: 0,
        open_work_orders: row.cnt,
        handling_breakdown: {},
        updated_at: now,
      });
    }
  }

  return Array.from(branchMap.values()).sort((a, b) => a.system_id.localeCompare(b.system_id));
}
