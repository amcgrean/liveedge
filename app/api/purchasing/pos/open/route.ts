import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

const CLOSED_STATUSES = `('CLOSED','COMPLETE','CANCELLED','CANCELED','VOID','RECEIVED')`;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['supervisor', 'admin'].includes(r));

  // Admins can pass ?branch= and ?supplier_code= to filter; others are scoped to their own branch
  const branchParam   = req.nextUrl.searchParams.get('branch') ?? '';
  const supplierParam = req.nextUrl.searchParams.get('supplier_code') ?? '';
  const branch   = isAdmin ? branchParam || null : (session.user.branch ?? null);
  const supplier = supplierParam || null;

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
      LEFT JOIN (
        SELECT system_id, po_id, COUNT(*)::int AS receipt_count
        FROM agility_receiving_header
        WHERE is_deleted = false
        GROUP BY system_id, po_id
      ) rh ON rh.system_id = ph.system_id AND rh.po_id = ph.po_id
      WHERE ph.is_deleted = false
        AND UPPER(COALESCE(ph.po_status, '')) NOT IN ${sql.unsafe(CLOSED_STATUSES)}
        ${branch   ? sql`AND ph.system_id    = ${branch}`   : sql``}
        ${supplier ? sql`AND ph.supplier_code = ${supplier}` : sql``}
      ORDER BY ph.expect_date ASC NULLS LAST
      LIMIT 1000
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[purchasing/pos/open]', err);
    return NextResponse.json({ error: 'ERP unavailable' }, { status: 503 });
  }
}
