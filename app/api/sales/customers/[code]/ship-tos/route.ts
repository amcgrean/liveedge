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
// Lists every ship-to for this customer. Union of:
//   - agility_customers rows (one per seq_num) — the source of truth for
//     address/lat/lon even when no orders exist.
//   - distinct shipto_seq_num values in agility_so_header — catches orders
//     whose ship-to was later deleted from the customer.
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
      lat: string | null;
      lon: string | null;
    };

    type AggRow = {
      seq_num: number | null;
      order_count: number;
      open_count: number;
      last_order_date: string | null;
      last_so_id: string | null;
      so_address_1: string | null;
      so_city: string | null;
      so_state: string | null;
      so_zip: string | null;
    };

    const [shiptoRows, aggRows] = await Promise.all([
      sql<ShipToRow[]>`
        SELECT
          seq_num,
          shipto_name,
          address_1,
          city,
          state,
          zip,
          lat::text  AS lat,
          lon::text  AS lon
        FROM agility_customers
        WHERE TRIM(cust_code) = TRIM(${code})
          AND is_deleted = false
        ORDER BY seq_num NULLS LAST
      `,
      sql<AggRow[]>`
        SELECT
          shipto_seq_num                                       AS seq_num,
          COUNT(*)::int                                        AS order_count,
          SUM(CASE WHEN UPPER(COALESCE(so_status,'O')) IN ('O','K','S','D')
                   THEN 1 ELSE 0 END)::int                     AS open_count,
          MAX(COALESCE(expect_date, created_date))::text       AS last_order_date,
          (array_agg(so_id::text ORDER BY COALESCE(expect_date, created_date) DESC NULLS LAST))[1]
                                                               AS last_so_id,
          MAX(shipto_address_1)                                AS so_address_1,
          MAX(shipto_city)                                     AS so_city,
          MAX(shipto_state)                                    AS so_state,
          MAX(shipto_zip)                                      AS so_zip
        FROM agility_so_header
        WHERE TRIM(cust_code) = TRIM(${code})
          AND is_deleted = false
        GROUP BY shipto_seq_num
      `,
    ]);

    // Build map: seq_num (nullable) → aggregate.
    // Use 'null' as the sentinel for shipto_seq_num IS NULL (→ seq_num = -1 on output).
    const aggBySeq = new Map<number | null, AggRow>();
    for (const a of aggRows) aggBySeq.set(a.seq_num, a);

    // Start with every customer ship-to.
    const byKey = new Map<number, CustomerShipTo>();
    for (const s of shiptoRows) {
      if (s.seq_num == null) continue;
      const agg = aggBySeq.get(s.seq_num);
      byKey.set(s.seq_num, {
        seq_num: s.seq_num,
        shipto_name: s.shipto_name?.trim() || null,
        address_1: s.address_1?.trim() || agg?.so_address_1?.trim() || null,
        city: s.city?.trim() || agg?.so_city?.trim() || null,
        state: s.state?.trim() || agg?.so_state?.trim() || null,
        zip: s.zip?.trim() || agg?.so_zip?.trim() || null,
        order_count: agg?.order_count ?? 0,
        open_count: agg?.open_count ?? 0,
        last_order_date: agg?.last_order_date ?? null,
        last_so_id: agg?.last_so_id ?? null,
        lat: s.lat != null ? parseFloat(s.lat) : null,
        lon: s.lon != null ? parseFloat(s.lon) : null,
      });
    }

    // Fold in any order-only ship-tos (seq_num not present in customer table).
    for (const a of aggRows) {
      if (a.seq_num == null) continue;
      if (byKey.has(a.seq_num)) continue;
      byKey.set(a.seq_num, {
        seq_num: a.seq_num,
        shipto_name: null,
        address_1: a.so_address_1?.trim() || null,
        city: a.so_city?.trim() || null,
        state: a.so_state?.trim() || null,
        zip: a.so_zip?.trim() || null,
        order_count: a.order_count,
        open_count: a.open_count,
        last_order_date: a.last_order_date,
        last_so_id: a.last_so_id,
        lat: null,
        lon: null,
      });
    }

    // "No ship-to assigned" bucket (shipto_seq_num IS NULL on orders).
    const unassigned = aggBySeq.get(null);
    if (unassigned && unassigned.order_count > 0) {
      byKey.set(-1, {
        seq_num: -1,
        shipto_name: null,
        address_1: unassigned.so_address_1?.trim() || null,
        city: unassigned.so_city?.trim() || null,
        state: unassigned.so_state?.trim() || null,
        zip: unassigned.so_zip?.trim() || null,
        order_count: unassigned.order_count,
        open_count: unassigned.open_count,
        last_order_date: unassigned.last_order_date,
        last_so_id: unassigned.last_so_id,
        lat: null,
        lon: null,
      });
    }

    // Sort: most-recent activity first, then ship-tos with no orders by seq_num.
    const shiptos = Array.from(byKey.values()).sort((a, b) => {
      const ad = a.last_order_date ?? '';
      const bd = b.last_order_date ?? '';
      if (ad !== bd) return ad < bd ? 1 : -1; // DESC, NULLS LAST
      return (a.seq_num ?? 9999) - (b.seq_num ?? 9999);
    });

    return NextResponse.json({ shiptos });
  } catch (err) {
    console.error('[sales/customers/ship-tos GET]', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Internal server error', message: msg }, { status: 500 });
  }
}
