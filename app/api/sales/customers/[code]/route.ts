import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

// GET /api/sales/customers/[code]
// Returns customer detail, all open orders, recent history, ship-to addresses.
//
// Open orders are returned in full (no LIMIT) so header counts are accurate.
// History is capped at 50 rows.
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

    type CustRow = {
      cust_key: string;
      cust_name: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      phone: string | null;
    };

    // rep_1 = sales rep on the order (account rep). salesperson = driver/route. We
    // surface rep_1 as the order's "Rep" column. Note: rep_1 does NOT exist on
    // agility_customers — only on agility_so_header.
    type OrderRow = {
      so_number: string;
      system_id: string;
      so_status: string;
      sale_type: string | null;
      ship_via: string | null;
      expect_date: string | null;
      invoice_date: string | null;
      reference: string | null;
      rep_1: string | null;
      line_count: number;
    };

    type ShipToRow = {
      shipto_seq: string;
      shipto_name: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
    };

    // Open statuses: O=open, K=picking, S=staged, D=delivered (not yet invoiced).
    // Fetch all open orders (no limit — typically small), plus recent history.
    const [custRows, openRows, historyRows, shiptoRows] = await Promise.all([
      sql<CustRow[]>`
        SELECT DISTINCT ON (cust_code) cust_key, cust_name, address_1, city, state, zip,
               cust_phone AS phone
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY cust_code, seq_num NULLS LAST
        LIMIT 1
      `,
      sql<OrderRow[]>`
        SELECT
          soh.so_id::text         AS so_number,
          soh.system_id,
          soh.so_status,
          soh.sale_type,
          soh.ship_via,
          soh.expect_date::text   AS expect_date,
          NULL::text              AS invoice_date,
          soh.reference,
          UPPER(TRIM(soh.rep_1))  AS rep_1,
          COALESCE((SELECT COUNT(*)::int FROM agility_so_lines sl
                     WHERE sl.so_id = soh.so_id AND sl.is_deleted = false), 0) AS line_count
        FROM agility_so_header soh
        WHERE TRIM(soh.cust_code) = TRIM(${code})
          AND soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status,'')) IN ('O','K','S','D')
          AND UPPER(COALESCE(soh.sale_type,'')) <> 'CREDIT'
        ORDER BY COALESCE(soh.expect_date, soh.created_date) DESC NULLS LAST, soh.so_id DESC
      `,
      sql<OrderRow[]>`
        SELECT
          soh.so_id::text         AS so_number,
          soh.system_id,
          soh.so_status,
          soh.sale_type,
          soh.ship_via,
          soh.expect_date::text   AS expect_date,
          NULL::text              AS invoice_date,
          soh.reference,
          UPPER(TRIM(soh.rep_1))  AS rep_1,
          COALESCE((SELECT COUNT(*)::int FROM agility_so_lines sl
                     WHERE sl.so_id = soh.so_id AND sl.is_deleted = false), 0) AS line_count
        FROM agility_so_header soh
        WHERE TRIM(soh.cust_code) = TRIM(${code})
          AND soh.is_deleted = false
          AND UPPER(COALESCE(soh.so_status,'')) IN ('I','C')
        ORDER BY COALESCE(soh.expect_date, soh.created_date) DESC NULLS LAST, soh.so_id DESC
        LIMIT 50
      `,
      sql<ShipToRow[]>`
        SELECT seq_num AS shipto_seq, shipto_name, address_1, city, state
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY seq_num
        LIMIT 50
      `,
    ]);

    if (!custRows.length) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({
      customer: custRows[0],
      open_orders: openRows,
      history: historyRows,
      ship_to: shiptoRows,
      open_count: openRows.length,
      total_count: openRows.length + historyRows.length,
    });
  } catch (err) {
    console.error('[sales/customers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
