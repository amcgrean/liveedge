import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

// GET /api/sales/customers/[code]/ar
// Returns open AR items for a customer from agility_ar_open
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await params;
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  try {
    const sql = getErpSql();

    // Look up cust_key from agility_customers first
    type CustKeyRow = { cust_key: string };
    const custRows = await sql<CustKeyRow[]>`
      SELECT DISTINCT cust_key
      FROM agility_customers
      WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
      LIMIT 1
    `;

    if (!custRows.length) {
      return NextResponse.json({ ar: [], summary: { total_open: 0, count: 0, oldest_days: null } });
    }

    const custKey = custRows[0].cust_key;

    type ArRow = {
      id: number;
      ref_num: string;
      ref_num_seq: number | null;
      ref_type: string | null;
      ref_date: string | null;
      amount: string | null;
      open_amt: string | null;
      open_flag: boolean;
      paid_in_full_date: string | null;
      discount_amt: string | null;
    };

    const arRows = await sql<ArRow[]>`
      SELECT
        id,
        ref_num,
        ref_num_seq,
        ref_type,
        ref_date::text,
        amount::text,
        open_amt::text,
        open_flag,
        paid_in_full_date::text,
        discount_amt::text
      FROM agility_ar_open
      WHERE cust_key = ${custKey}
        AND is_deleted = false
      ORDER BY open_flag DESC, ref_date DESC
      LIMIT 200
    `;

    const open = arRows.filter((r: ArRow) => r.open_flag);
    const totalOpen = open.reduce((sum: number, r: ArRow) => sum + parseFloat(r.open_amt ?? '0'), 0);

    // Find oldest open item age in days
    let oldestDays: number | null = null;
    if (open.length > 0) {
      const oldestDate = open
        .map((r: ArRow) => r.ref_date ? new Date(r.ref_date) : null)
        .filter((d: Date | null): d is Date => d !== null)
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
      if (oldestDate instanceof Date) {
        oldestDays = Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return NextResponse.json({
      ar: arRows,
      summary: {
        total_open: totalOpen,
        count: open.length,
        oldest_days: oldestDays,
      },
    });
  } catch (err) {
    console.error('[sales/customers/ar GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
