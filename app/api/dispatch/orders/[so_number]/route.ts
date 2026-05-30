import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../src/lib/access-control-shared';
import { getErpSql } from '../../../../../db/supabase';

/**
 * GET /api/dispatch/orders/:so_number[?branch=20GR]
 *
 * Mobile SO-lookup endpoint. Returns enough header data to render the
 * driver-app delivery details screen, plus a hint at whether the SO is
 * already on a dispatch route stop (so the client can decide whether to
 * show the "Take this stop" claim button).
 *
 * Allowed for users with dispatch.view OR sales.view — sales staff need
 * to look up shipping status; drivers need it to handle stops not on
 * their assigned route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const authResult = await requireSessionOrMobile(req, 'dispatch.view', 'dispatch.manage', 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { so_number } = await params;
  if (!so_number?.trim()) {
    return NextResponse.json({ error: 'so_number required' }, { status: 400 });
  }
  const soNumber = so_number.trim();

  // Resolve branch. branch.all users can query cross-branch; everyone else is
  // pinned to their session branch. The SO header row is keyed by system_id,
  // so we have to know which branch to query.
  const isAdmin = hasCapability(session, 'branch.all');
  const queryBranch = (req.nextUrl.searchParams.get('branch') ?? '').trim();
  const effectiveBranch = isAdmin && queryBranch ? queryBranch : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type HeaderRow = {
      so_id: string;
      system_id: string;
      cust_name: string | null;
      cust_code: string | null;
      shipto_address_1: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
      shipto_zip: string | null;
      reference: string | null;
      po_number: string | null;
      ship_via: string | null;
      so_status: string | null;
      sale_type: string | null;
      created_date: string | null;
      shipto_seq_num: number | null;
      line_count: number;
      ext_total: string | null;
    };

    const branchFilter = effectiveBranch
      ? sql`AND h.system_id = ${effectiveBranch}`
      : sql``;

    const rows = await sql<HeaderRow[]>`
      SELECT
        h.so_id::text AS so_id,
        h.system_id,
        h.cust_name,
        h.cust_code,
        h.shipto_address_1,
        h.shipto_city,
        h.shipto_state,
        h.shipto_zip,
        h.reference,
        h.po_number,
        h.ship_via,
        h.so_status,
        h.sale_type,
        h.created_date::text AS created_date,
        h.shipto_seq_num,
        COALESCE(line_summary.line_count, 0)::int AS line_count,
        line_summary.ext_total::text AS ext_total
      FROM agility_so_header h
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS line_count,
               SUM(extended_price) AS ext_total
        FROM agility_so_lines
        WHERE so_id = h.so_id
          AND system_id = h.system_id
          AND is_deleted = false
      ) line_summary ON true
      WHERE h.so_id::text = ${soNumber}
        AND h.is_deleted = false
        ${branchFilter}
      ORDER BY h.created_date DESC NULLS LAST
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'SO not found' }, { status: 404 });
    }
    const h = rows[0];

    type StopRow = {
      id: number;
      route_id: number;
      shipment_num: number;
      status: string;
      notes: string | null;
      route_date: string;
      route_name: string;
      branch_code: string;
    };
    const stops = await sql<StopRow[]>`
      SELECT s.id, s.route_id, s.shipment_num, s.status, s.notes,
             r.route_date::text AS route_date,
             r.route_name, r.branch_code
      FROM dispatch_route_stops s
      JOIN dispatch_routes r ON r.id = s.route_id
      WHERE s.so_id = ${soNumber}
        AND r.branch_code = ${h.system_id}
      ORDER BY r.route_date DESC, s.id DESC
      LIMIT 1
    `;
    const existingStop = stops[0] ?? null;

    // Agility-side dispatch reality. Beisser dispatchers actually build
    // routes in Agility (old POD system), so dispatch_route_stops is
    // usually empty for real loads. agility_shipments is the source of
    // truth for "is a driver carrying this today?" Use the most recent
    // non-deleted shipment for the SO.
    type AgilityShipmentRow = {
      shipment_num: number;
      ship_date: string | null;
      expect_date: string | null;
      status_flag: string | null;
      status_flag_delivery: string | null;
      route_id_char: string | null;
      driver: string | null;
    };
    const shipments = await sql<AgilityShipmentRow[]>`
      SELECT shipment_num,
             ship_date::text   AS ship_date,
             expect_date::text AS expect_date,
             status_flag,
             status_flag_delivery,
             route_id_char,
             driver
      FROM agility_shipments
      WHERE so_id = ${soNumber}
        AND system_id = ${h.system_id}
        AND is_deleted = false
      ORDER BY ship_date DESC NULLS LAST, shipment_num DESC
      LIMIT 1
    `;
    const agilityShipment = shipments[0] ?? null;

    return NextResponse.json({
      so: {
        so_id: h.so_id,
        branch_code: h.system_id,
        customer_name: h.cust_name?.trim() || null,
        cust_code: h.cust_code?.trim() || null,
        address_1: h.shipto_address_1?.trim() || null,
        city: h.shipto_city?.trim() || null,
        state: h.shipto_state?.trim() || null,
        zip: h.shipto_zip?.trim() || null,
        reference: h.reference?.trim() || null,
        po_number: h.po_number?.trim() || null,
        ship_via: h.ship_via?.trim() || null,
        so_status: h.so_status?.trim() || null,
        sale_type: h.sale_type?.trim() || null,
        created_date: h.created_date,
        shipto_seq_num: h.shipto_seq_num,
        line_count: h.line_count,
        ext_total: h.ext_total ? parseFloat(h.ext_total) : null,
      },
      existing_stop: existingStop
        ? {
            id: existingStop.id,
            route_id: existingStop.route_id,
            shipment_num: existingStop.shipment_num,
            status: existingStop.status,
            notes: existingStop.notes,
            route_date: existingStop.route_date,
            route_name: existingStop.route_name,
            branch_code: existingStop.branch_code,
          }
        : null,
      agility_shipment: agilityShipment
        ? {
            shipment_num: agilityShipment.shipment_num,
            ship_date: agilityShipment.ship_date,
            expect_date: agilityShipment.expect_date,
            status_flag: agilityShipment.status_flag?.trim() || null,
            status_flag_delivery: agilityShipment.status_flag_delivery?.trim() || null,
            route_id_char: agilityShipment.route_id_char?.trim() || null,
            driver: agilityShipment.driver?.trim() || null,
          }
        : null,
    });
  } catch (err) {
    console.error('[dispatch/orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
