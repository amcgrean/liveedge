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

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));
  const effectiveBranch = isAdmin ? '' : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type RawRow = {
      wo_id: string;
      source_id: string;
      item_number: string | null;
      description: string | null;
      wo_status: string;
      handling_code: string | null;
      so_branch: string | null;
      assignment_id: number | null;
      assigned_to_id: number | null;
      assigned_to_name: string | null;
      assignment_status: string | null;
    };

    const rows = await sql<RawRow[]>`
      SELECT
        wh.wo_id::text AS wo_id,
        wh.source_id::text,
        COALESCE(wh.item_code, sol.item_code)              AS item_number,
        COALESCE(wh.description, sol.description)          AS description,
        wh.wo_status,
        COALESCE(sol.handling_code, NULLIF(wh.department,''), wh.wo_rule) AS handling_code,
        soh.system_id  AS so_branch,
        wa.id          AS assignment_id,
        wa.assigned_to_id,
        ps.name        AS assigned_to_name,
        wa.status      AS assignment_status
      FROM agility_wo_header wh
      LEFT JOIN agility_so_lines sol
        ON sol.so_id = wh.source_id::text AND sol.sequence = wh.source_seq AND sol.is_deleted = false
      LEFT JOIN agility_so_header soh
        ON soh.so_id = wh.source_id::text AND soh.is_deleted = false
      LEFT JOIN work_orders wa
        ON wa.work_order_number = wh.wo_id::text
      LEFT JOIN pickster ps
        ON ps.id = wa.assigned_to_id
      WHERE wh.is_deleted = false
        AND wh.source_id::text = ${so}
        AND UPPER(COALESCE(wh.source, '')) = 'SO'
        ${effectiveBranch ? sql`AND soh.system_id = ${effectiveBranch}` : sql``}
      ORDER BY wh.wo_id
    `;

    return NextResponse.json(rows.map((r) => ({
      wo_id: r.wo_id,
      so_number: r.source_id,
      item_number: r.item_number,
      description: r.description,
      wo_status: r.wo_status,
      handling_code: r.handling_code,
      branch_code: r.so_branch,
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
