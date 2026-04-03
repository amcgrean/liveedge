import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/history?q=&customer_number=&date_from=&date_to=&branch=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q')?.trim() ?? '';
  const customerNumber = searchParams.get('customer_number')?.trim() ?? '';
  const dateFrom = searchParams.get('date_from') ?? '';
  const dateTo = searchParams.get('date_to') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const offset = (page - 1) * limit;

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  let effectiveBranch = isAdmin ? (searchParams.get('branch') ?? '') : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type HistoryRow = {
      so_number: string;
      system_id: string;
      so_status: string;
      sale_type: string | null;
      ship_via: string | null;
      salesperson: string | null;
      expect_date: string | null;
      invoice_date: string | null;
      reference: string | null;
      po_number: string | null;
      customer_name: string | null;
      customer_code: string | null;
      line_count: number;
    };

    const rows = await sql<HistoryRow[]>`
      WITH inv AS (
        SELECT system_id, so_id, MAX(invoice_date) AS invoice_date
        FROM agility_shipments WHERE is_deleted = false
        GROUP BY system_id, so_id
      )
      SELECT
        soh.so_id            AS so_number,
        soh.system_id,
        soh.so_status,
        soh.sale_type,
        soh.ship_via,
        soh.salesperson,
        soh.expect_date      ::text AS expect_date,
        inv.invoice_date     ::text AS invoice_date,
        soh.reference,
        soh.po_number,
        soh.cust_name        AS customer_name,
        soh.cust_code        AS customer_code,
        COUNT(DISTINCT sol.sequence)::int AS line_count
      FROM agility_so_header soh
      LEFT JOIN agility_so_lines sol
        ON sol.so_id = soh.so_id AND sol.system_id = soh.system_id AND sol.is_deleted = false
      LEFT JOIN inv ON inv.so_id = soh.so_id AND inv.system_id = soh.system_id
      WHERE soh.is_deleted = false
        AND UPPER(COALESCE(soh.so_status, '')) IN ('I', 'C')
        ${effectiveBranch ? sql`AND soh.system_id = ${effectiveBranch}` : sql``}
        ${customerNumber ? sql`AND TRIM(soh.cust_code) = TRIM(${customerNumber})` : sql``}
        ${dateFrom ? sql`AND CAST(COALESCE(inv.invoice_date, soh.expect_date) AS DATE) >= ${dateFrom}::date` : sql``}
        ${dateTo ? sql`AND CAST(COALESCE(inv.invoice_date, soh.expect_date) AS DATE) <= ${dateTo}::date` : sql``}
        ${
          q
            ? sql`AND (
                soh.so_id ILIKE ${'%' + q + '%'}
                OR soh.cust_name ILIKE ${'%' + q + '%'}
                OR soh.reference ILIKE ${'%' + q + '%'}
                OR soh.po_number ILIKE ${'%' + q + '%'}
              )`
            : sql``
        }
      GROUP BY
        soh.so_id, soh.system_id, soh.so_status, soh.sale_type, soh.ship_via,
        soh.salesperson, soh.expect_date, soh.reference, soh.po_number,
        soh.cust_name, soh.cust_code, inv.invoice_date
      ORDER BY inv.invoice_date DESC NULLS LAST, soh.so_id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({ history: rows, page, limit });
  } catch (err) {
    console.error('[sales/history GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
