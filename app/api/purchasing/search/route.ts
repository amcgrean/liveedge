import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json([]);

  const limit = Math.min(25, parseInt(req.nextUrl.searchParams.get('limit') ?? '25', 10) || 25);
  const like = `%${q}%`;

  try {
    const sql = getErpSql();
    const rows = await sql<{
      po_number: string;
      supplier_name: string | null;
      supplier_code: string | null;
      system_id: string | null;
      expect_date: string | null;
      order_date: string | null;
      po_status: string | null;
      receipt_count: number | null;
    }[]>`
      SELECT po_number, supplier_name, supplier_code, system_id,
             expect_date, order_date, po_status, receipt_count
      FROM app_po_search
      WHERE po_number ILIKE ${like}
         OR supplier_name ILIKE ${like}
         OR supplier_code ILIKE ${like}
      ORDER BY po_number
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[purchasing/search]', err);
    return NextResponse.json({ error: 'Search unavailable' }, { status: 503 });
  }
}
