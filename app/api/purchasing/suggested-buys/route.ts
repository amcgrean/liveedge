import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/purchasing/suggested-buys?branch=20GR&q=lumber&limit=200
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin = hasCapability(session, 'branch.all');

  const branchParam = req.nextUrl.searchParams.get('branch') ?? '';
  const branch = isAdmin ? branchParam || null : (session.user.branch ?? null);
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10) || 200);

  try {
    const sql = getErpSql();

    // Per-PPO rollups via LATERALs against `agility_item_supplier`:
    //   ims_sup     = rule row for (this item × the suggested supplier) — drives lead time + min-order
    //   ims_primary = the item's primary supplier — diff vs. sph.supplier_code = mismatch
    // Same join shape as /api/purchasing/suggested-buys/[ppo_id]; aggregated here so list
    // rows can show warning chips without expanding.
    const rows = await sql`
      SELECT
        sph.ppo_id,
        sph.system_id,
        sph.supplier_code,
        COALESCE(sph.supplier_name, sph.supplier_code)                                 AS supplier_name,
        sph.created_date::text                                                          AS order_date,
        MIN(spl.exp_rcpt_date)::text                                                    AS expect_date,
        CASE WHEN sph.is_available THEN 'OPEN' ELSE 'PENDING' END                       AS ppo_status,
        COUNT(spl.id)::int                                                              AS line_count,
        SUM(spl.qty_ordered)::numeric                                                   AS total_qty,
        SUM(spl.qty_ordered * spl.cost)::numeric                                        AS estimated_value,
        MAX(ims_sup.lead_time_1)::int                                                   AS max_lead_time_days,
        BOOL_OR(ims_sup.min_ord_violation = 'Block')                                    AS has_blocking_min_violation,
        BOOL_OR(
          ims_primary.supplier_code_primary IS NOT NULL
          AND ims_primary.supplier_code_primary <> sph.supplier_code
        )                                                                               AS has_primary_mismatch
      FROM agility_suggested_po_header sph
      LEFT JOIN agility_suggested_po_lines spl
        ON spl.system_id = sph.system_id AND spl.ppo_id = sph.ppo_id AND spl.is_deleted = false
      LEFT JOIN LATERAL (
        SELECT ims.lead_time_1, ims.min_ord_violation
        FROM agility_item_supplier ims
        JOIN agility_suppliers s
          ON TRIM(s.supplier_key) = TRIM(ims.supplier_key)
         AND s.ship_from_seq = ims.ship_from_seq_num
         AND s.is_deleted = false
        WHERE ims.item_ptr = spl.item_ptr
          AND ims.system_id = spl.system_id
          AND s.supplier_code = sph.supplier_code
          AND ims.is_deleted = false
        ORDER BY ims.is_primary DESC NULLS LAST, ims.lead_time_1 ASC NULLS LAST
        LIMIT 1
      ) ims_sup ON true
      LEFT JOIN LATERAL (
        SELECT s.supplier_code AS supplier_code_primary
        FROM agility_item_supplier ims
        JOIN agility_suppliers s
          ON TRIM(s.supplier_key) = TRIM(ims.supplier_key)
         AND s.ship_from_seq = ims.ship_from_seq_num
         AND s.is_deleted = false
        WHERE ims.item_ptr = spl.item_ptr
          AND ims.system_id = spl.system_id
          AND ims.is_primary = true
          AND ims.is_deleted = false
        LIMIT 1
      ) ims_primary ON true
      WHERE sph.is_deleted = false
        ${branch ? sql`AND sph.system_id = ${branch}` : sql``}
        ${q ? sql`AND (sph.ppo_id::text ILIKE ${'%' + q + '%'} OR sph.supplier_code ILIKE ${'%' + q + '%'} OR sph.supplier_name ILIKE ${'%' + q + '%'})` : sql``}
      GROUP BY sph.ppo_id, sph.system_id, sph.supplier_code, sph.supplier_name,
               sph.created_date, sph.is_available
      ORDER BY MIN(spl.exp_rcpt_date) ASC NULLS LAST, sph.ppo_id
      LIMIT ${limit}
    `;

    return NextResponse.json({ suggestions: rows });
  } catch (err) {
    console.error('[purchasing/suggested-buys GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
