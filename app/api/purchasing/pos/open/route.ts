import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

const CLOSED_STATUSES = `('CLOSED','COMPLETE','CANCELLED','CANCELED','VOID','RECEIVED')`;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['supervisor', 'admin'].includes(r));

  // Admins can pass ?branch= to filter; others are scoped to their own branch
  const branchParam = req.nextUrl.searchParams.get('branch') ?? '';
  const branch = isAdmin ? branchParam || null : (session.user.branch ?? null);

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
      WHERE UPPER(COALESCE(po_status, '')) NOT IN ${sql.unsafe(CLOSED_STATUSES)}
        ${branch ? sql`AND system_id = ${branch}` : sql``}
      ORDER BY expect_date ASC NULLS LAST
      LIMIT 500
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[purchasing/pos/open]', err);
    return NextResponse.json({ error: 'ERP unavailable' }, { status: 503 });
  }
}
