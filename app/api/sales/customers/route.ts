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

    // rep_1 is the sales rep assigned to the customer account (in agility_customers).
    // agility_so_header.salesperson is the driver/route on a specific order — NOT the
    // account rep — so we don't read it here.
    type CustRow = {
      cust_code: string;
      cust_name: string | null;
      rep_1: string | null;
    };

    const custRows = await sql<CustRow[]>`
      SELECT
        cust_code,
        MAX(cust_name) AS cust_name,
        UPPER(TRIM(MAX(rep_1))) AS rep_1
      FROM agility_customers
      WHERE is_deleted = false
        ${q ? sql`AND (cust_code ILIKE ${'%' + q + '%'} OR cust_name ILIKE ${'%' + q + '%'})` : sql``}
      GROUP BY cust_code
      ORDER BY MAX(cust_name) ASC NULLS LAST
      LIMIT ${limit}
    `;

    const customers = custRows.map((r) => ({
      cust_code: r.cust_code,
      cust_name: r.cust_name,
      rep_1: r.rep_1 || null,
    }));

    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[sales/customers GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
