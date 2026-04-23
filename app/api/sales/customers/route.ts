import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/customers?q=&limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  try {
    const sql = getErpSql();

    type CustRow = {
      cust_code: string;
      cust_name: string | null;
    };

    const custRows = await sql<CustRow[]>`
      SELECT cust_code, MAX(cust_name) AS cust_name
      FROM agility_customers
      WHERE is_deleted = false
        ${q ? sql`AND (cust_code ILIKE ${'%' + q + '%'} OR cust_name ILIKE ${'%' + q + '%'})` : sql``}
      GROUP BY cust_code
      ORDER BY MAX(cust_name) ASC NULLS LAST
      LIMIT ${limit}
    `;

    if (custRows.length === 0) {
      return NextResponse.json({ customers: [] });
    }

    const codes = custRows.map((r) => r.cust_code);

    type RepRow = { cust_code: string; salesperson: string };
    let reps: RepRow[] = [];
    try {
      reps = await sql<RepRow[]>`
        SELECT DISTINCT ON (cust_code)
          cust_code,
          UPPER(TRIM(salesperson)) AS salesperson
        FROM agility_so_header
        WHERE cust_code = ANY(${codes})
          AND is_deleted = false
          AND salesperson IS NOT NULL
          AND TRIM(salesperson) <> ''
        ORDER BY cust_code, created_date DESC NULLS LAST
      `;
    } catch (repErr) {
      console.error('[sales/customers GET reps]', repErr);
    }

    const repMap = new Map(reps.map((r) => [r.cust_code, r.salesperson]));

    const customers = custRows.map((r) => ({
      cust_code: r.cust_code,
      cust_name: r.cust_name,
      salesperson: repMap.get(r.cust_code) ?? null,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[sales/customers GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
