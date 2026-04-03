import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

// GET /api/sales/customers/[code]
// Returns customer detail, recent open orders, ship-to addresses
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

    type OrderRow = {
      so_number: string;
      system_id: string;
      so_status: string;
      sale_type: string | null;
      ship_via: string | null;
      expect_date: string | null;
      invoice_date: string | null;
      reference: string | null;
    };

    type ShipToRow = {
      shipto_seq: string;
      shipto_name: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
    };

    const [custRows, orderRows, shiptoRows] = await Promise.all([
      sql<CustRow[]>`
        SELECT DISTINCT ON (cust_code) cust_key, cust_name, address_1, city, state, zip, cust_phone AS phone
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY cust_code, seq_num NULLS LAST
        LIMIT 1
      `,
      sql<OrderRow[]>`
        SELECT so_id AS so_number, system_id, so_status, sale_type, ship_via,
               expect_date::text, NULL::text AS invoice_date, reference
        FROM agility_so_header
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY expect_date DESC NULLS LAST
        LIMIT 50
      `,
      sql<ShipToRow[]>`
        SELECT seq_num AS shipto_seq, shipto_name, address_1, city, state
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code}) AND is_deleted = false
        ORDER BY seq_num
        LIMIT 20
      `,
    ]);

    if (!custRows.length) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const open = orderRows.filter((o) => o.so_status?.toUpperCase() === 'O');
    const history = orderRows.filter((o) => ['I', 'C'].includes(o.so_status?.toUpperCase() ?? ''));

    return NextResponse.json({
      customer: custRows[0],
      open_orders: open,
      history,
      ship_to: shiptoRows,
      open_count: open.length,
      total_count: orderRows.length,
    });
  } catch (err) {
    console.error('[sales/customers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
