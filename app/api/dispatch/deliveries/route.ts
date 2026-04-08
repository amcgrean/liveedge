import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface DeliveryStop {
  so_id: string;
  shipment_num: number;
  system_id: string;
  ship_date: string;
  status_flag: string;
  so_status: string | null;
  route_id_char: string | null;
  driver: string | null;
  ship_via: string | null;
  loaded_date: string | null;
  loaded_time: string | null;
  reference: string | null;
  sale_type: string | null;
  customer_name: string | null;
  cust_code: string | null;
  address_1: string | null;
  city: string | null;
  expect_date: string | null;
  ar_balance: number | null;
}

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

  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    const sql = getErpSql();

    type RawRow = {
      so_id: string;
      shipment_num: number;
      system_id: string;
      ship_date: string;
      status_flag: string | null;
      so_status: string | null;
      route_id_char: string | null;
      driver: string | null;
      ship_via: string | null;
      loaded_date: string | null;
      loaded_time: string | null;
      reference: string | null;
      sale_type: string | null;
      cust_name: string | null;
      cust_code: string | null;
      address_1: string | null;
      city: string | null;
      expect_date: string | null;
    };

    const branchFilter = effectiveBranch
      ? sql`AND soh.system_id = ${effectiveBranch}`
      : sql``;

    // Query by expect_date so open/staged orders show up even before ship_date is set.
    // LEFT JOIN shipments to pull route/driver/loaded info when available.
    // Use the most recent shipment per SO (MAX shipment_num) to avoid duplicate rows.
    const rows = await sql<RawRow[]>`
      SELECT
        soh.so_id::text, soh.system_id,
        COALESCE(sh.shipment_num, 0)        AS shipment_num,
        sh.ship_date::text,
        COALESCE(sh.status_flag, soh.so_status) AS status_flag,
        soh.so_status,
        sh.route_id_char, sh.driver,
        COALESCE(sh.ship_via, soh.ship_via) AS ship_via,
        sh.loaded_date::text, sh.loaded_time,
        soh.reference, soh.sale_type,
        soh.cust_name, soh.cust_code,
        soh.shipto_address_1 AS address_1, soh.shipto_city AS city,
        soh.expect_date::text
      FROM agility_so_header soh
      LEFT JOIN LATERAL (
        SELECT *
        FROM agility_shipments s
        WHERE s.system_id = soh.system_id
          AND s.so_id = soh.so_id
          AND s.is_deleted = false
        ORDER BY s.shipment_num DESC
        LIMIT 1
      ) sh ON true
      WHERE soh.is_deleted = false
        ${branchFilter}
        AND soh.so_status NOT IN ('C', 'X')
        AND soh.expect_date::date = ${deliveryDate}::date
      ORDER BY soh.system_id, sh.route_id_char NULLS LAST, soh.so_id
    `;

    // AR balance — separate query so delivery board still loads if AR data is unavailable
    type ArRow = { cust_code: string; open_amt: number };
    let arByCode: Record<string, number> = {};
    try {
      const custCodes = [...new Set(rows.map((r) => r.cust_code?.trim()).filter(Boolean))] as string[];
      if (custCodes.length > 0) {
        const arRows = await sql<ArRow[]>`
          SELECT TRIM(ac.cust_code) AS cust_code, SUM(ar.open_amt) AS open_amt
          FROM agility_ar_open ar
          JOIN agility_customers ac ON ac.cust_key = ar.cust_key AND ac.is_deleted = false
          WHERE ar.open_flag = true
            AND ar.is_deleted = false
            AND TRIM(ac.cust_code) = ANY(${custCodes})
          GROUP BY TRIM(ac.cust_code)
        `;
        arByCode = Object.fromEntries(arRows.map((r) => [r.cust_code, Number(r.open_amt)]));
      }
    } catch (arErr) {
      console.warn('[dispatch/deliveries] AR balance fetch failed (non-fatal):', arErr);
    }

    const stops: DeliveryStop[] = rows.map((r: RawRow) => ({
      so_id: r.so_id,
      shipment_num: r.shipment_num,
      system_id: r.system_id,
      ship_date: r.ship_date,
      status_flag: r.status_flag ?? '',
      so_status: r.so_status?.trim() || null,
      route_id_char: r.route_id_char?.trim() || null,
      driver: r.driver?.trim() || null,
      ship_via: r.ship_via?.trim() || null,
      loaded_date: r.loaded_date,
      loaded_time: r.loaded_time?.trim() || null,
      reference: r.reference?.trim() || null,
      sale_type: r.sale_type?.trim() || null,
      customer_name: r.cust_name?.trim() || null,
      cust_code: r.cust_code?.trim() || null,
      address_1: r.address_1?.trim() || null,
      city: r.city?.trim() || null,
      expect_date: r.expect_date,
      ar_balance: arByCode[r.cust_code?.trim() ?? ''] ?? null,
    }));

    return NextResponse.json(stops);
  } catch (err) {
    console.error('[dispatch/deliveries GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
