import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { type OpenPO, RECEIPT_COUNT_SUBQUERY, CLOSED_PO_STATUSES } from '../../../../../src/lib/purchasing';

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
        AND UPPER(COALESCE(ph.po_status, '')) NOT IN ${sql.unsafe(CLOSED_PO_STATUSES)}
        ${branch   ? sql`AND ph.system_id     = ${branch}`   : sql``}
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
