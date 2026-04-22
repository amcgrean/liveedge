import { getErpSql } from '../../db/supabase';

export interface BranchStats {
  system_id: string;
  open_picks: number;
  open_work_orders: number;
  handling_breakdown: Record<string, number>;
  updated_at: string;
}

// Fetch open pick order and work order counts per branch.
// Counts by distinct order/WO — never by line.
export async function fetchBranchStats(
  isAdmin: boolean,
  userBranch: string | null | undefined
): Promise<BranchStats[]> {
  const sql = getErpSql();
  const branchLock = !isAdmin && userBranch ? userBranch : null;

  const branchCondition = branchLock
    ? sql`AND soh.system_id = ${branchLock}`
    : sql`AND soh.system_id NOT IN ('', 'SYSTEM')`;

  // Total open picks per branch: distinct SOs with at least one active line
  type TotalRow = { system_id: string; cnt: number };
  const totalRows = await sql<TotalRow[]>`
    SELECT soh.system_id, COUNT(DISTINCT soh.so_id)::int AS cnt
    FROM agility_so_header soh
    JOIN agility_so_lines sol
      ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id
      AND sol.is_deleted = false
    LEFT JOIN (
      SELECT system_id, so_id, MAX(invoice_date::date) AS invoice_date
      FROM agility_shipments
      WHERE is_deleted = false
      GROUP BY system_id, so_id
    ) sh ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
    WHERE soh.is_deleted = false
      AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('C')
      AND (
        UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
        OR (UPPER(COALESCE(soh.so_status, '')) = 'I'
            AND sh.invoice_date = (NOW() AT TIME ZONE 'America/Chicago')::date)
        OR soh.expect_date::date = (NOW() AT TIME ZONE 'America/Chicago')::date
      )
      AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
      ${branchCondition}
    GROUP BY soh.system_id
  `;

  // Handling breakdown per branch: distinct SOs per named handling code
  type BreakdownRow = { system_id: string; handling_code: string; cnt: number };
  const breakdownRows = await sql<BreakdownRow[]>`
    SELECT
      soh.system_id,
      UPPER(sol.handling_code) AS handling_code,
      COUNT(DISTINCT soh.so_id)::int AS cnt
    FROM agility_so_header soh
    JOIN agility_so_lines sol
      ON sol.system_id = soh.system_id AND sol.so_id = soh.so_id
      AND sol.is_deleted = false
      AND UPPER(COALESCE(sol.handling_code, '')) NOT IN ('', 'UNROUTED')
    LEFT JOIN (
      SELECT system_id, so_id, MAX(invoice_date::date) AS invoice_date
      FROM agility_shipments
      WHERE is_deleted = false
      GROUP BY system_id, so_id
    ) sh ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id
    WHERE soh.is_deleted = false
      AND UPPER(COALESCE(soh.so_status, '')) NOT IN ('C')
      AND (
        UPPER(COALESCE(soh.so_status, '')) IN ('K', 'P', 'S')
        OR (UPPER(COALESCE(soh.so_status, '')) = 'I'
            AND sh.invoice_date = (NOW() AT TIME ZONE 'America/Chicago')::date)
        OR soh.expect_date::date = (NOW() AT TIME ZONE 'America/Chicago')::date
      )
      AND UPPER(COALESCE(soh.sale_type, '')) NOT IN ('DIRECT', 'WILLCALL', 'XINSTALL', 'HOLD')
      ${branchCondition}
    GROUP BY soh.system_id, UPPER(sol.handling_code)
  `;

  // Open work orders per branch: distinct WOs not completed/cancelled
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

  for (const r of totalRows) {
    branchMap.set(r.system_id, {
      system_id: r.system_id,
      open_picks: r.cnt,
      open_work_orders: 0,
      handling_breakdown: {},
      updated_at: now,
    });
  }

  for (const r of breakdownRows) {
    const entry = branchMap.get(r.system_id);
    if (entry) entry.handling_breakdown[r.handling_code] = r.cnt;
  }

  for (const r of woRows) {
    if (!r.system_id) continue;
    const entry = branchMap.get(r.system_id);
    if (entry) {
      entry.open_work_orders = r.cnt;
    } else {
      branchMap.set(r.system_id, {
        system_id: r.system_id,
        open_picks: 0,
        open_work_orders: r.cnt,
        handling_breakdown: {},
        updated_at: now,
      });
    }
  }

  return Array.from(branchMap.values()).sort((a, b) =>
    a.system_id.localeCompare(b.system_id)
  );
}
