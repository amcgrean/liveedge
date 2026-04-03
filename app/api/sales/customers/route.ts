import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/customers?q=&branch=&limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const branch = (searchParams.get('branch') ?? '').trim();
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  try {
    const sql = getErpSql();

    type Row = {
      cust_code: string;
      cust_name: string | null;
      branch_code: string | null;
      phone: string | null;
      email: string | null;
      balance: number | null;
      credit_limit: number | null;
    };

    const rows = await sql<Row[]>`
      SELECT cust_code, MAX(cust_name) AS cust_name, MAX(branch_code) AS branch_code,
             MAX(cust_phone) AS phone, MAX(cust_email) AS email,
             MAX(balance) AS balance, MAX(credit_limit) AS credit_limit
      FROM agility_customers
      WHERE is_deleted = false
        ${q ? sql`AND (cust_code ILIKE ${'%' + q + '%'} OR cust_name ILIKE ${'%' + q + '%'})` : sql``}
        ${branch ? sql`AND branch_code = ${branch}` : sql``}
      GROUP BY cust_code
      ORDER BY MAX(cust_name) ASC NULLS LAST
      LIMIT ${limit}
    `;

    return NextResponse.json({ customers: rows });
  } catch (err) {
    console.error('[sales/customers GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
