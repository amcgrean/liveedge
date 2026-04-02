import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface DeliveryStop {
  so_id: string;
  shipment_num: number;
  system_id: string;
  ship_date: string;
  status_flag: string;
  route_id_char: string | null;
  driver: string | null;
  ship_via: string | null;
  loaded_date: string | null;
  loaded_time: string | null;
  reference: string | null;
  sale_type: string | null;
  customer_name: string | null;
  address_1: string | null;
  city: string | null;
}

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  K: 'Picking',
  P: 'Picked',
  S: 'Staged',
  D: 'Out for Delivery',
  I: 'Invoiced',
  C: 'Completed',
};

export { DELIVERY_STATUS_LABELS };

// GET /api/dispatch/deliveries?date=2026-04-02&branch=20GR
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const dateParam = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const branchParam = searchParams.get('branch') ?? '';

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  const effectiveBranch = isAdmin ? branchParam : (session.user.branch ?? '');

  // Validate date
  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    type RawRow = {
      so_id: string;
      shipment_num: number;
      system_id: string;
      ship_date: string;
      status_flag: string | null;
      route_id_char: string | null;
      driver: string | null;
      ship_via: string | null;
      loaded_date: string | null;
      loaded_time: string | null;
      reference: string | null;
      sale_type: string | null;
      cust_name: string | null;
      address_1: string | null;
      city: string | null;
    };

    const rows = effectiveBranch
      ? await sql<RawRow[]>`
          SELECT
            sh.so_id, sh.shipment_num, sh.system_id,
            sh.ship_date::text, sh.status_flag, sh.route_id_char, sh.driver,
            sh.ship_via, sh.loaded_date::text, sh.loaded_time,
            soh.reference, soh.sale_type,
            c.cust_name,
            cs.address_1, cs.city
          FROM erp_mirror_shipments_header sh
          JOIN erp_mirror_so_header soh
            ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id AND soh.is_deleted = false
          LEFT JOIN erp_mirror_cust c
            ON TRIM(c.cust_key) = TRIM(soh.cust_key)
          LEFT JOIN erp_mirror_cust_shipto cs
            ON TRIM(cs.cust_key) = TRIM(soh.cust_key)
           AND TRIM(CAST(cs.seq_num AS TEXT)) = TRIM(CAST(soh.shipto_seq_num AS TEXT))
          WHERE sh.is_deleted = false
            AND sh.system_id = ${effectiveBranch}
            AND CAST(sh.ship_date AS DATE) = ${deliveryDate}::date
          ORDER BY sh.route_id_char NULLS LAST, sh.so_id
        `
      : await sql<RawRow[]>`
          SELECT
            sh.so_id, sh.shipment_num, sh.system_id,
            sh.ship_date::text, sh.status_flag, sh.route_id_char, sh.driver,
            sh.ship_via, sh.loaded_date::text, sh.loaded_time,
            soh.reference, soh.sale_type,
            c.cust_name,
            cs.address_1, cs.city
          FROM erp_mirror_shipments_header sh
          JOIN erp_mirror_so_header soh
            ON soh.system_id = sh.system_id AND soh.so_id = sh.so_id AND soh.is_deleted = false
          LEFT JOIN erp_mirror_cust c
            ON TRIM(c.cust_key) = TRIM(soh.cust_key)
          LEFT JOIN erp_mirror_cust_shipto cs
            ON TRIM(cs.cust_key) = TRIM(soh.cust_key)
           AND TRIM(CAST(cs.seq_num AS TEXT)) = TRIM(CAST(soh.shipto_seq_num AS TEXT))
          WHERE sh.is_deleted = false
            AND CAST(sh.ship_date AS DATE) = ${deliveryDate}::date
          ORDER BY sh.system_id, sh.route_id_char NULLS LAST, sh.so_id
        `;

    const stops: DeliveryStop[] = rows.map((r) => ({
      so_id: r.so_id,
      shipment_num: r.shipment_num,
      system_id: r.system_id,
      ship_date: r.ship_date,
      status_flag: r.status_flag ?? '',
      route_id_char: r.route_id_char?.trim() || null,
      driver: r.driver?.trim() || null,
      ship_via: r.ship_via?.trim() || null,
      loaded_date: r.loaded_date,
      loaded_time: r.loaded_time?.trim() || null,
      reference: r.reference?.trim() || null,
      sale_type: r.sale_type?.trim() || null,
      customer_name: r.cust_name?.trim() || null,
      address_1: r.address_1?.trim() || null,
      city: r.city?.trim() || null,
    }));

    return NextResponse.json(stops);
  } catch (err) {
    console.error('[dispatch/deliveries GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
