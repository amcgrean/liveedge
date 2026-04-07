import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';
import { type OpenPO, RECEIPT_COUNT_SUBQUERY } from '../../../../src/lib/purchasing';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json([]);

  const limit = Math.min(25, parseInt(req.nextUrl.searchParams.get('limit') ?? '25', 10) || 25);
  const like = `%${q}%`;

  try {
    const sql = getErpSql();
    const rows = await sql<OpenPO[]>`
      SELECT
        ph.po_id AS po_number,
        ph.supplier_name,
        ph.supplier_code,
        ph.system_id,
        ph.expect_date::text AS expect_date,
        ph.order_date::text AS order_date,
        ph.po_status,
        COALESCE(rh.receipt_count, 0)::int AS receipt_count
      FROM agility_po_header ph
      LEFT JOIN ${sql.unsafe(RECEIPT_COUNT_SUBQUERY)} rh
        ON rh.system_id = ph.system_id AND rh.po_id = ph.po_id
      WHERE ph.is_deleted = false
        AND (
          ph.po_id ILIKE ${like}
          OR ph.supplier_name ILIKE ${like}
          OR ph.supplier_code ILIKE ${like}
        )
      ORDER BY ph.po_id
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[purchasing/search]', err);
    return NextResponse.json({ error: 'Search unavailable' }, { status: 503 });
  }
}
