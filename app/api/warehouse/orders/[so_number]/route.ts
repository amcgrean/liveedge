import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../../db/supabase';

export interface WarehouseOrderHeader {
  so_id: string;
  cust_name: string | null;
  cust_code: string | null;
  reference: string | null;
  so_status: string | null;
  sale_type: string | null;
  expect_date: string | null;
  shipto_name: string | null;
  shipto_addr1: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
}

export interface WarehouseOrderLine {
  so_line_id: number | string;
  item_code: string | null;
  description: string | null;
  qty_ordered: number | null;
  qty_shipped: number | null;
  unit_price: number | null;
  handling_code: string | null;
  sequence: number | null;
}

export interface WarehouseOrderPick {
  tran_id: string;
  created_date: string | null;
  print_status: string | null;
}

export interface WarehouseOrderAssignedPicker {
  picker_id: number;
  picker_name: string;
}

export interface WarehouseOrderDetail {
  header: WarehouseOrderHeader;
  lines: WarehouseOrderLine[];
  picks: WarehouseOrderPick[];
  assigned_picker: WarehouseOrderAssignedPicker | null;
}

// Strip leading zeros from SO number for ERP lookup
function normalizeSONumber(raw: string): string {
  return raw.replace(/^0+/, '') || '0';
}

// GET /api/warehouse/orders/[so_number]
// No auth required (read-only ERP data).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const { so_number } = await params;
  const soNumber = normalizeSONumber(so_number);

  try {
    const sql = getErpSql();

    // --- Header ---
    type HeaderRow = {
      so_id: string;
      cust_name: string | null;
      cust_code: string | null;
      reference: string | null;
      so_status: string | null;
      sale_type: string | null;
      expect_date: string | null;
      shipto_name: string | null;
      shipto_addr1: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
    };

    const headerRows = (await sql`
      SELECT
        so_id::text,
        cust_name,
        cust_code,
        reference,
        so_status,
        sale_type,
        expect_date::text,
        shipto_name,
        shipto_addr1,
        shipto_city,
        shipto_state
      FROM agility_so_header
      WHERE is_deleted = false
        AND so_id::text = ${soNumber}
      LIMIT 1
    `) as unknown as HeaderRow[];

    if (!headerRows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const h = headerRows[0];

    // --- Lines ---
    type LineRow = {
      so_line_id: string;
      item_code: string | null;
      description: string | null;
      qty_ordered: string | null;
      qty_shipped: string | null;
      unit_price: string | null;
      handling_code: string | null;
      sequence: number | null;
    };

    const lineRows = (await sql`
      SELECT
        id::text AS so_line_id,
        item_code,
        COALESCE(NULLIF(TRIM(so_desc), ''), description) AS description,
        qty_ordered::float::text AS qty_ordered,
        qty_shipped::float::text AS qty_shipped,
        price::float::text       AS unit_price,
        handling_code,
        sequence
      FROM agility_so_lines
      WHERE is_deleted = false
        AND so_id::text = ${soNumber}
      ORDER BY sequence NULLS LAST
    `) as unknown as LineRow[];

    const lines: WarehouseOrderLine[] = lineRows.map((r) => ({
      so_line_id: r.so_line_id,
      item_code: r.item_code,
      description: r.description,
      qty_ordered: r.qty_ordered != null ? parseFloat(r.qty_ordered) : null,
      qty_shipped: r.qty_shipped != null ? parseFloat(r.qty_shipped) : null,
      unit_price: r.unit_price != null ? parseFloat(r.unit_price) : null,
      handling_code: r.handling_code,
      sequence: r.sequence,
    }));

    // --- Picks ---
    type PickRow = {
      tran_id: string;
      created_date: string | null;
      print_status: string | null;
    };

    const pickRows = (await sql`
      SELECT
        tran_id::text,
        created_date::text,
        print_status
      FROM agility_picks
      WHERE is_deleted = false
        AND tran_type = 'SO'
        AND tran_id::text = ${soNumber}
      ORDER BY created_date DESC
      LIMIT 50
    `) as unknown as PickRow[];

    const picks: WarehouseOrderPick[] = pickRows.map((r) => ({
      tran_id: r.tran_id,
      created_date: r.created_date,
      print_status: r.print_status,
    }));

    // --- Assigned picker ---
    type AssignRow = {
      picker_id: number;
      picker_name: string;
    };

    const assignRows = (await sql`
      SELECT pa.picker_id, ps.name AS picker_name
      FROM pick_assignments pa
      JOIN pickster ps ON ps.id = pa.picker_id
      WHERE pa.so_number = ${soNumber}
      LIMIT 1
    `) as unknown as AssignRow[];

    const assigned_picker: WarehouseOrderAssignedPicker | null =
      assignRows.length
        ? { picker_id: assignRows[0].picker_id, picker_name: assignRows[0].picker_name }
        : null;

    const detail: WarehouseOrderDetail = {
      header: {
        so_id: h.so_id,
        cust_name: h.cust_name,
        cust_code: h.cust_code,
        reference: h.reference,
        so_status: h.so_status,
        sale_type: h.sale_type,
        expect_date: h.expect_date,
        shipto_name: h.shipto_name,
        shipto_addr1: h.shipto_addr1,
        shipto_city: h.shipto_city,
        shipto_state: h.shipto_state,
      },
      lines,
      picks,
      assigned_picker,
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error('[warehouse/orders/[so_number] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
