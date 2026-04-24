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
// Returns one row per ship-to address for a customer, with order counts.
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

    // Aggregate orders per shipto_seq_num. Use the SO's own shipto_* fields as
    // the fallback display (in case no matching agility_customers row exists
    // or the customer ship-to was deleted).
    const rows = await sql<ShipToRow[]>`
      WITH so_jobs AS (
        SELECT
          COALESCE(shipto_seq_num, -1) AS seq_num,
          MAX(shipto_address_1) AS so_address_1,
          MAX(shipto_city)      AS so_city,
          MAX(shipto_state)     AS so_state,
          MAX(shipto_zip)       AS so_zip,
          COUNT(*)::int         AS order_count,
          SUM(CASE WHEN UPPER(COALESCE(so_status,'O')) IN ('O','K','S') THEN 1 ELSE 0 END)::int AS open_count,
          MAX(COALESCE(expect_date, created_date))::text AS last_order_date,
          (array_agg(so_id::text ORDER BY COALESCE(expect_date, created_date) DESC NULLS LAST))[1] AS last_so_id
        FROM agility_so_header
        WHERE TRIM(cust_code) = TRIM(${code})
          AND is_deleted = false
        GROUP BY COALESCE(shipto_seq_num, -1)
      )
      SELECT
        sj.seq_num,
        ac.shipto_name,
        COALESCE(ac.address_1, sj.so_address_1) AS address_1,
        COALESCE(ac.city,      sj.so_city)      AS city,
        COALESCE(ac.state,     sj.so_state)     AS state,
        COALESCE(ac.zip,       sj.so_zip)       AS zip,
        sj.order_count,
        sj.open_count,
        sj.last_order_date,
        sj.last_so_id,
        ac.lat::text,
        ac.lon::text
      FROM so_jobs sj
      LEFT JOIN agility_customers ac
        ON TRIM(ac.cust_code) = TRIM(${code})
        AND ac.seq_num = sj.seq_num
        AND ac.is_deleted = false
      ORDER BY sj.last_order_date DESC NULLS LAST, sj.seq_num
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
