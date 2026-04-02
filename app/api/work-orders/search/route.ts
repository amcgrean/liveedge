import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/work-orders/search?so=1234567
// Returns work orders for a specific SO number (for barcode scan / lookup).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const so = (req.nextUrl.searchParams.get('so') ?? '').trim().replace(/^0+/, '');
  if (!so) return NextResponse.json({ error: 'so parameter required' }, { status: 400 });

  try {
    const sql = getErpSql();

    type RawRow = {
      wo_id: string;
      source_id: string;
      item_number: string | null;
      description: string | null;
      wo_status: string;
      handling_code: string | null;
      assignment_id: number | null;
      assigned_to_id: number | null;
      assigned_to_name: string | null;
      assignment_status: string | null;
    };

    const rows = await sql<RawRow[]>`
      SELECT
        wh.wo_id,
        wh.source_id,
        COALESCE(i.item, sod_item.item)               AS item_number,
        COALESCE(i.description, sod_item.description)  AS description,
        wh.wo_status,
        COALESCE(ib.handling_code, NULLIF(wh.department,''), wh.wo_rule) AS handling_code,
        wa.id          AS assignment_id,
        wa.assigned_to_id,
        ps.name        AS assigned_to_name,
        wa.status      AS assignment_status
      FROM erp_mirror_wo_header wh
      LEFT JOIN erp_mirror_so_detail sod
        ON sod.so_id = wh.source_id AND sod.sequence = wh.source_seq AND sod.is_deleted = false
      LEFT JOIN erp_mirror_item i
        ON i.item_ptr = wh.item_ptr AND i.is_deleted = false
      LEFT JOIN erp_mirror_item sod_item
        ON sod_item.item_ptr = sod.item_ptr AND sod_item.is_deleted = false
      LEFT JOIN erp_mirror_item_branch ib
        ON (ib.item_ptr = wh.item_ptr OR ib.item_ptr = sod.item_ptr)
           AND ib.system_id = COALESCE(wh.branch_code, sod.system_id)
           AND ib.is_deleted = false
      LEFT JOIN work_orders wa
        ON wa.work_order_number = wh.wo_id
      LEFT JOIN pickster ps
        ON ps.id = wa.assigned_to_id
      WHERE wh.is_deleted = false
        AND CAST(wh.source_id AS TEXT) = ${so}
        AND UPPER(COALESCE(wh.source, '')) = 'SO'
      ORDER BY wh.wo_id
    `;

    return NextResponse.json(rows.map((r) => ({
      wo_id: r.wo_id,
      so_number: r.source_id,
      item_number: r.item_number,
      description: r.description,
      wo_status: r.wo_status,
      handling_code: r.handling_code,
      assignment_id: r.assignment_id,
      assigned_to_id: r.assigned_to_id,
      assigned_to_name: r.assigned_to_name,
      assignment_status: r.assignment_status,
    })));
  } catch (err) {
    console.error('[work-orders/search GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
