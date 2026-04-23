import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface CreditLine {
  sequence: number | null;
  item_code: string | null;
  description: string | null;
  size: string | null;
  qty_ordered: string | null;
  qty_shipped: string | null;
  price: string | null;
  uom: string | null;
  handling_code: string | null;
}

export interface CreditShipment {
  shipment_num: number | null;
  ship_date: string | null;
  invoice_date: string | null;
  ship_via: string | null;
  driver: string | null;
  route: string | null;
  status_flag: string | null;
}

export interface CreditDetail {
  so_id: string;
  system_id: string;
  cust_code: string | null;
  cust_name: string | null;
  reference: string | null;
  po_number: string | null;
  so_status: string | null;
  salesperson: string | null;
  created_date: string | null;
  expect_date: string | null;
  address_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  ship_via: string | null;
  lines: CreditLine[];
  shipments: CreditShipment[];
}

// GET /api/credits/[id]
// Returns header + line items + shipments for one credit memo.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    const sql = getErpSql();

    type HeaderRow = {
      so_id: string; system_id: string; cust_code: string | null; cust_name: string | null;
      reference: string | null; po_number: string | null; so_status: string | null;
      salesperson: string | null; created_date: string | null; expect_date: string | null;
      address_1: string | null; city: string | null; state: string | null; zip: string | null;
      ship_via: string | null;
    };
    type LineRow = {
      sequence: string | null; item_code: string | null; description: string | null;
      size_: string | null; qty_ordered: string | null; qty_shipped: string | null;
      price: string | null; price_uom_ptr: string | null; handling_code: string | null;
    };
    type ShipRow = {
      shipment_num: string | null; ship_date: string | null; invoice_date: string | null;
      ship_via: string | null; driver: string | null; route_id_char: string | null;
      status_flag: string | null;
    };

    const [headers, lines, shipments] = await Promise.all([
      sql<HeaderRow[]>`
        SELECT
          soh.so_id::text                AS so_id,
          soh.system_id,
          TRIM(soh.cust_code)            AS cust_code,
          soh.cust_name,
          soh.reference,
          soh.po_number,
          soh.so_status,
          soh.salesperson,
          soh.created_date::text         AS created_date,
          soh.expect_date::text          AS expect_date,
          soh.shipto_address_1           AS address_1,
          soh.shipto_city                AS city,
          soh.shipto_state               AS state,
          soh.shipto_zip                 AS zip,
          soh.ship_via
        FROM agility_so_header soh
        WHERE soh.is_deleted = false
          AND soh.so_id::text = ${id}
          AND soh.sale_type = 'Credit'
        LIMIT 1
      `,
      sql<LineRow[]>`
        SELECT
          sol.sequence,
          sol.item_code,
          COALESCE(NULLIF(TRIM(sol.so_desc), ''), sol.description) AS description,
          sol.size_,
          sol.qty_ordered::text    AS qty_ordered,
          sol.qty_shipped::text    AS qty_shipped,
          sol.price::text          AS price,
          sol.price_uom_ptr,
          sol.handling_code
        FROM agility_so_lines sol
        WHERE sol.is_deleted = false
          AND sol.so_id::text = ${id}
        ORDER BY sol.sequence NULLS LAST
      `,
      sql<ShipRow[]>`
        SELECT
          sh.shipment_num,
          sh.ship_date::text     AS ship_date,
          sh.invoice_date::text  AS invoice_date,
          sh.ship_via,
          sh.driver,
          sh.route_id_char,
          sh.status_flag
        FROM agility_shipments sh
        WHERE sh.is_deleted = false
          AND sh.so_id::text = ${id}
        ORDER BY sh.shipment_num NULLS LAST
      `,
    ]);

    if (!headers.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const h = headers[0];
    const detail: CreditDetail = {
      so_id:        h.so_id,
      system_id:    h.system_id,
      cust_code:    h.cust_code?.trim() || null,
      cust_name:    h.cust_name?.trim() || null,
      reference:    h.reference?.trim() || null,
      po_number:    h.po_number?.trim() || null,
      so_status:    h.so_status?.trim() || null,
      salesperson:  h.salesperson?.trim() || null,
      created_date: h.created_date,
      expect_date:  h.expect_date,
      address_1:    h.address_1?.trim() || null,
      city:         h.city?.trim() || null,
      state:        h.state?.trim() || null,
      zip:          h.zip?.trim() || null,
      ship_via:     h.ship_via?.trim() || null,
      lines: lines.map((l) => ({
        sequence:     l.sequence != null ? parseInt(l.sequence) : null,
        item_code:    l.item_code?.trim() || null,
        description:  l.description?.trim() || null,
        size:         l.size_?.trim() || null,
        qty_ordered:  l.qty_ordered,
        qty_shipped:  l.qty_shipped,
        price:        l.price,
        uom:          l.price_uom_ptr?.trim() || null,
        handling_code: l.handling_code?.trim() || null,
      })),
      shipments: shipments.map((s) => ({
        shipment_num: s.shipment_num != null ? parseInt(s.shipment_num) : null,
        ship_date:    s.ship_date,
        invoice_date: s.invoice_date,
        ship_via:     s.ship_via?.trim() || null,
        driver:       s.driver?.trim() || null,
        route:        s.route_id_char?.trim() || null,
        status_flag:  s.status_flag?.trim() || null,
      })),
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[credits detail GET]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
