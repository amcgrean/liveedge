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

    const lines = await sql`
      SELECT spl.id, spl.sequence,
             aib.item_code,
             COALESCE(spl.ppo_desc, aib.description)  AS description,
             spl.qty_ordered                           AS qty_to_order,
             spl.cost                                  AS unit_cost,
             spl.uom                                   AS stocking_uom,
             aib.qty_on_hand,
             aib.default_location
      FROM agility_suggested_po_lines spl
      LEFT JOIN agility_item_branch aib
        ON aib.item_ptr = spl.item_ptr AND aib.system_id = spl.system_id
      WHERE spl.is_deleted = false
        AND spl.ppo_id = ${ppo_id}
        AND spl.system_id = ${(headers[0] as { system_id: string }).system_id}
      ORDER BY spl.sequence
    `;

    return NextResponse.json({ header: headers[0], lines });
  } catch (err) {
    console.error('[purchasing/suggested-buys/[ppo_id] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
