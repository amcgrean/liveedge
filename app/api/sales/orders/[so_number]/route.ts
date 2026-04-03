import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';

export interface OrderLine {
  sequence: number;
  item: string | null;
  description: string | null;
  size: string | null;
  qty_ordered: number | null;
  bo: number | null;
  price: number | null;
  uom: string | null;
}

export interface OrderDetail {
  so_number: string;
  system_id: string;
  so_status: string;
  sale_type: string | null;
  customer_name: string | null;
  customer_code: string | null;
  reference: string | null;
  po_number: string | null;
  expect_date: string | null;
  created_date: string | null;
  invoice_date: string | null;
  ship_date: string | null;
  promise_date: string | null;
  ship_via: string | null;
  terms: string | null;
  salesperson: string | null;
  branch_code: string | null;
  lines: OrderLine[];
}

// GET /api/sales/orders/[so_number]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number } = await params;

  try {
    const sql = getErpSql();

    type HeaderRow = {
      so_id: string;
      system_id: string;
      so_status: string | null;
      sale_type: string | null;
      customer_name: string | null;
      customer_code: string | null;
      reference: string | null;
      po_number: string | null;
      expect_date: string | null;
      created_date: string | null;
      invoice_date: string | null;
      ship_date: string | null;
      promise_date: string | null;
      ship_via: string | null;
      terms: string | null;
      salesperson: string | null;
      branch_code: string | null;
    };

    const headers = await sql<HeaderRow[]>`
      SELECT
        soh.so_id::text,
        soh.system_id,
        soh.so_status,
        soh.sale_type,
        soh.cust_name  AS customer_name,
        soh.cust_code  AS customer_code,
        soh.reference,
        soh.po_number,
        soh.expect_date::text,
        soh.created_date::text,
        MAX(sh.invoice_date)::text AS invoice_date,
        MAX(sh.ship_date)::text    AS ship_date,
        NULL::text                 AS promise_date,
        soh.ship_via,
        NULL::text                 AS terms,
        soh.salesperson,
        soh.branch_code
      FROM agility_so_header soh
      LEFT JOIN agility_shipments sh
        ON sh.system_id = soh.system_id AND sh.so_id = soh.so_id AND sh.is_deleted = false
      WHERE soh.is_deleted = false
        AND soh.so_id::text = ${so_number}
      GROUP BY soh.so_id, soh.system_id, soh.so_status, soh.sale_type,
               soh.cust_name, soh.cust_code, soh.reference, soh.po_number,
               soh.expect_date, soh.created_date, soh.ship_via, soh.salesperson, soh.branch_code
      LIMIT 1
    `;

    if (!headers.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const h = headers[0];

    type LineRow = {
      sequence: number;
      item: string | null;
      description: string | null;
      size_: string | null;
      qty_ordered: string | null;
      bo: string | null;
      price: string | null;
      price_uom_ptr: string | null;
    };

    const lineRows = await sql<LineRow[]>`
      SELECT
        sol.sequence,
        sol.item_code AS item,
        COALESCE(NULLIF(TRIM(sol.so_desc), ''), sol.description) AS description,
        sol.size_,
        sol.qty_ordered::text,
        sol.bo::text,
        sol.price::text,
        sol.price_uom_ptr
      FROM agility_so_lines sol
      WHERE sol.is_deleted = false
        AND sol.system_id = ${h.system_id}
        AND sol.so_id::text = ${so_number}
      ORDER BY sol.sequence
    `;

    const lines: OrderLine[] = lineRows.map((r) => ({
      sequence: r.sequence,
      item: r.item,
      description: r.description,
      size: r.size_,
      qty_ordered: r.qty_ordered != null ? parseFloat(r.qty_ordered) : null,
      bo: r.bo != null ? parseFloat(r.bo) : null,
      price: r.price != null ? parseFloat(r.price) : null,
      uom: r.price_uom_ptr,
    }));

    const detail: OrderDetail = {
      so_number: h.so_id,
      system_id: h.system_id,
      so_status: h.so_status ?? '',
      sale_type: h.sale_type,
      customer_name: h.customer_name,
      customer_code: h.customer_code,
      reference: h.reference,
      po_number: h.po_number,
      expect_date: h.expect_date,
      created_date: h.created_date,
      invoice_date: h.invoice_date,
      ship_date: h.ship_date,
      promise_date: h.promise_date,
      ship_via: h.ship_via,
      terms: h.terms,
      salesperson: h.salesperson,
      branch_code: h.branch_code,
      lines,
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[sales/orders/[so_number] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
