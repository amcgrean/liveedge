import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';

// GET /api/purchasing/suggested-buys/[ppo_id]?branch=20GR
export async function GET(req: NextRequest, { params }: { params: Promise<{ ppo_id: string }> }) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;

  const { ppo_id } = await params;
  const branch = req.nextUrl.searchParams.get('branch') ?? '';

  try {
    const sql = getErpSql();

    const headers = await sql`
      SELECT sph.ppo_id, sph.system_id, sph.supplier_code,
             COALESCE(sph.supplier_name, sph.supplier_code)          AS supplier_name,
             sph.created_date::text                                   AS order_date,
             NULL::text                                               AS expect_date,
             CASE WHEN sph.is_available THEN 'OPEN' ELSE 'PENDING' END AS ppo_status
      FROM agility_suggested_po_header sph
      WHERE sph.is_deleted = false AND sph.ppo_id = ${ppo_id}
        ${branch ? sql`AND sph.system_id = ${branch}` : sql``}
      LIMIT 1
    `;

    if (!headers[0]) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    const header = headers[0] as { system_id: string; supplier_code: string };

    // For each line:
    //   • ims_sup = rule for the SUGGESTED-PO supplier (lead time, min order, violation, supp UOM)
    //   • ims_primary = the item's primary supplier (may differ from suggested supplier)
    // When the suggested supplier ≠ the item's primary supplier we surface a
    // "mismatch" chip so buyers know to review before approving.
    const lines = await sql`
      SELECT spl.id, spl.sequence,
             aib.item_code,
             COALESCE(spl.ppo_desc, aib.description)  AS description,
             spl.qty_ordered                           AS qty_to_order,
             spl.cost                                  AS unit_cost,
             spl.uom                                   AS stocking_uom,
             aib.qty_on_hand,
             aib.default_location,
             ims_sup.lead_time_1                       AS lead_time_days,
             ims_sup.min_ord_qty::float8               AS min_order_qty,
             ims_sup.min_ord_qty_disp_uom              AS min_order_qty_uom,
             ims_sup.min_ord_violation                 AS min_order_violation,
             ims_sup.supp_uom                          AS supplier_uom,
             ims_primary.supplier_code_primary,
             ims_primary.supplier_name_primary
      FROM agility_suggested_po_lines spl
      LEFT JOIN agility_item_branch aib
        ON aib.item_ptr = spl.item_ptr AND aib.system_id = spl.system_id
      LEFT JOIN agility_suggested_po_header sph
        ON sph.system_id = spl.system_id AND sph.ppo_id = spl.ppo_id AND sph.is_deleted = false
      LEFT JOIN LATERAL (
        SELECT ims.lead_time_1, ims.min_ord_qty, ims.min_ord_qty_disp_uom,
               ims.min_ord_violation, ims.supp_uom
        FROM agility_item_supplier ims
        JOIN agility_suppliers s
          ON TRIM(s.supplier_key) = TRIM(ims.supplier_key)
         AND s.ship_from_seq = ims.ship_from_seq_num
         AND s.is_deleted = false
        WHERE ims.item_ptr = spl.item_ptr
          AND s.supplier_code = sph.supplier_code
          AND ims.is_deleted = false
        ORDER BY ims.is_primary DESC NULLS LAST, ims.lead_time_1 ASC NULLS LAST
        LIMIT 1
      ) ims_sup ON true
      LEFT JOIN LATERAL (
        SELECT s.supplier_code AS supplier_code_primary,
               COALESCE(s.ship_from_name, s.supplier_name) AS supplier_name_primary
        FROM agility_item_supplier ims
        JOIN agility_suppliers s
          ON TRIM(s.supplier_key) = TRIM(ims.supplier_key)
         AND s.ship_from_seq = ims.ship_from_seq_num
         AND s.is_deleted = false
        WHERE ims.item_ptr = spl.item_ptr
          AND ims.is_primary = true
          AND ims.is_deleted = false
        LIMIT 1
      ) ims_primary ON true
      WHERE spl.is_deleted = false
        AND spl.ppo_id = ${ppo_id}
        AND spl.system_id = ${header.system_id}
      ORDER BY spl.sequence
    `;

    return NextResponse.json({ header: headers[0], lines });
  } catch (err) {
    console.error('[purchasing/suggested-buys/[ppo_id] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
