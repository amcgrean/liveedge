import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getErpSql } from '../../../../../../db/supabase';

export interface ShipmentPick {
  pick_id: number;
  picker_name: string | null;
  start_time: string | null;
  completed_time: string | null;
  shipment_num: string | null;
  barcode_number: string | null;
}

export interface ShipmentRecord {
  shipment_num: number;
  ship_date: string | null;
  invoice_date: string | null;
  status_flag: string | null;
  status_flag_delivery: string | null;
  route_id_char: string | null;
  driver: string | null;
  ship_via: string | null;
  loaded_date: string | null;
  loaded_time: string | null;
  picks: ShipmentPick[];
}

// GET /api/sales/orders/[so_number]/shipments
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number } = await params;

  try {
    const sql = getErpSql();

    type ShipmentRow = {
      shipment_num: number;
      ship_date: string | null;
      invoice_date: string | null;
      status_flag: string | null;
      status_flag_delivery: string | null;
      route_id_char: string | null;
      driver: string | null;
      ship_via: string | null;
      loaded_date: string | null;
      loaded_time: string | null;
    };

    const shipmentRows = await sql<ShipmentRow[]>`
      SELECT
        sh.shipment_num,
        sh.ship_date::text     AS ship_date,
        sh.invoice_date::text  AS invoice_date,
        sh.status_flag,
        sh.status_flag_delivery,
        sh.route_id_char,
        sh.driver,
        sh.ship_via,
        sh.loaded_date::text   AS loaded_date,
        sh.loaded_time
      FROM agility_shipments sh
      WHERE sh.is_deleted = false
        AND sh.so_id::text = ${so_number}
      ORDER BY sh.shipment_num
    `;

    if (!shipmentRows.length) {
      return NextResponse.json([]);
    }

    // Fetch WH-Tracker pick records for this SO — non-fatal if table missing
    type PickRow = {
      pick_id: number;
      picker_name: string | null;
      start_time: string | null;
      completed_time: string | null;
      shipment_num: string | null;
      barcode_number: string | null;
    };

    const picksByShipment: Record<string, ShipmentPick[]> = {};
    try {
      const pickRows = await sql<PickRow[]>`
        SELECT
          p.id          AS pick_id,
          ps.name       AS picker_name,
          p.start_time::text  AS start_time,
          p.completed_time::text AS completed_time,
          p.shipment_num,
          p.barcode_number
        FROM pick p
        LEFT JOIN pickster ps ON ps.id = p.picker_id
        WHERE p.barcode_number = ${so_number}
          AND p.completed_time IS NOT NULL
        ORDER BY p.start_time DESC
      `;

      // Group picks by shipment_num (use raw string to match agility_shipments.shipment_num)
      for (const row of pickRows) {
        const key = row.shipment_num != null ? String(row.shipment_num) : '__none__';
        if (!picksByShipment[key]) picksByShipment[key] = [];
        picksByShipment[key].push({
          pick_id: row.pick_id,
          picker_name: row.picker_name?.trim() || null,
          start_time: row.start_time,
          completed_time: row.completed_time,
          shipment_num: row.shipment_num,
          barcode_number: row.barcode_number,
        });
      }
    } catch (pickErr) {
      console.warn('[sales/orders/shipments] Pick fetch failed (non-fatal):', pickErr);
    }

    const result: ShipmentRecord[] = shipmentRows.map((sh) => ({
      shipment_num: sh.shipment_num,
      ship_date: sh.ship_date,
      invoice_date: sh.invoice_date,
      status_flag: sh.status_flag?.trim() || null,
      status_flag_delivery: sh.status_flag_delivery?.trim() || null,
      route_id_char: sh.route_id_char?.trim() || null,
      driver: sh.driver?.trim() || null,
      ship_via: sh.ship_via?.trim() || null,
      loaded_date: sh.loaded_date,
      loaded_time: sh.loaded_time?.trim() || null,
      picks: picksByShipment[String(sh.shipment_num)] ?? [],
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[sales/orders/shipments GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
