import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

export interface CustomerShipTo {
  seq_num: number | null;
  shipto_name: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  order_count: number;
  open_count: number;
  last_order_date: string | null;
  last_so_id: string | null;
  lat: number | null;
  lon: number | null;
}

// GET /api/sales/customers/[code]/ship-tos
// Returns one row per ship-to for a customer, merging:
//   - every ship-to in agility_customers (even with 0 orders), and
//   - every distinct shipto_seq_num appearing in agility_so_header for this
//     customer (catches orders whose ship-to was later deleted).
// seq_num = -1 represents the "no ship-to assigned" bucket.
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

    type ShipToRow = {
      seq_num: number | null;
      shipto_name: string | null;
      address_1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      order_count: number;
      open_count: number;
      last_order_date: string | null;
      last_so_id: string | null;
      lat: string | null;
      lon: string | null;
    };

    const rows = await sql<ShipToRow[]>`
      WITH orders_agg AS (
        SELECT
          COALESCE(shipto_seq_num, -1) AS seq_num,
          MAX(shipto_address_1)        AS so_address_1,
          MAX(shipto_city)             AS so_city,
          MAX(shipto_state)            AS so_state,
          MAX(shipto_zip)              AS so_zip,
          COUNT(*)::int                AS order_count,
          SUM(CASE WHEN UPPER(COALESCE(so_status,'O')) IN ('O','K','S','D')
                   THEN 1 ELSE 0 END)::int AS open_count,
          MAX(COALESCE(expect_date, created_date))::text AS last_order_date,
          (array_agg(so_id::text ORDER BY COALESCE(expect_date, created_date) DESC NULLS LAST))[1] AS last_so_id
        FROM agility_so_header
        WHERE TRIM(cust_code) = TRIM(${code})
          AND is_deleted = false
        GROUP BY COALESCE(shipto_seq_num, -1)
      ),
      customer_shiptos AS (
        SELECT
          seq_num,
          shipto_name,
          address_1,
          city,
          state,
          zip,
          lat::text AS lat,
          lon::text AS lon
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code})
          AND is_deleted = false
      )
      SELECT
        COALESCE(cs.seq_num, oa.seq_num)                          AS seq_num,
        cs.shipto_name,
        COALESCE(cs.address_1, oa.so_address_1)                   AS address_1,
        COALESCE(cs.city,      oa.so_city)                        AS city,
        COALESCE(cs.state,     oa.so_state)                       AS state,
        COALESCE(cs.zip,       oa.so_zip)                         AS zip,
        COALESCE(oa.order_count, 0)                               AS order_count,
        COALESCE(oa.open_count, 0)                                AS open_count,
        oa.last_order_date,
        oa.last_so_id,
        cs.lat,
        cs.lon
      FROM customer_shiptos cs
      FULL OUTER JOIN orders_agg oa
        ON oa.seq_num = cs.seq_num
      ORDER BY oa.last_order_date DESC NULLS LAST,
               COALESCE(cs.seq_num, oa.seq_num)
    `;

    const shiptos: CustomerShipTo[] = rows.map((r) => ({
      seq_num: r.seq_num,
      shipto_name: r.shipto_name?.trim() || null,
      address_1: r.address_1?.trim() || null,
      city: r.city?.trim() || null,
      state: r.state?.trim() || null,
      zip: r.zip?.trim() || null,
      order_count: r.order_count,
      open_count: r.open_count,
      last_order_date: r.last_order_date,
      last_so_id: r.last_so_id,
      lat: r.lat != null ? parseFloat(r.lat) : null,
      lon: r.lon != null ? parseFloat(r.lon) : null,
    }));

    return NextResponse.json({ shiptos });
  } catch (err) {
    console.error('[sales/customers/ship-tos GET]', err);
    return NextResponse.json({ error: 'Internal server error', message: String(err) }, { status: 500 });
  }
}
