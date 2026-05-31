import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../../db/supabase';
import {
  deriveMobileStatus,
  type MobileOrderLine,
  type MobileOrderStatus,
  type MobileTimelineStep,
} from '../../_shared';

const PIPELINE: MobileOrderStatus[] = ['open', 'picking', 'staged', 'delivery', 'invoiced'];

/** Build the 5-stop fulfillment timeline from the current lifecycle stage. */
function buildTimeline(current: MobileOrderStatus): MobileTimelineStep[] {
  const idx = PIPELINE.indexOf(current);
  return PIPELINE.map((key, i) => ({
    key,
    state: i < idx ? 'done' : i === idx ? 'active' : 'todo',
  }));
}

// GET /api/sales/mobile/orders/[so]
// Mirror-backed order header + UOM-aware lines + derived timeline.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ so: string }> },
) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { so } = await params;

  // Branch-scope non-admins so an SO# from another branch can't be read by
  // guessing — matches the order-list endpoint.
  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin ? '' : (session.user.branch ?? '');

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
      ship_via: string | null;
      branch_code: string | null;
      shipto_address_1: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
    };

    const headers = await sql<HeaderRow[]>`
      SELECT
        soh.so_id::text,
        soh.system_id,
        soh.so_status,
        soh.sale_type,
        soh.cust_name AS customer_name,
        soh.cust_code AS customer_code,
        soh.reference,
        soh.po_number,
        soh.expect_date::text,
        soh.created_date::text,
        soh.ship_via,
        soh.branch_code,
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state
      FROM agility_so_header soh
      WHERE soh.is_deleted = false AND soh.so_id::text = ${so}
        ${branch ? sql`AND soh.system_id = ${branch}` : sql``}
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
      qty_ordered: string | null;
      uom: string | null;
      price: string | null;
      extended_price: string | null;
    };
    const lineRows = await sql<LineRow[]>`
      SELECT
        sol.sequence,
        sol.item_code AS item,
        COALESCE(NULLIF(TRIM(sol.so_desc), ''), sol.description) AS description,
        sol.qty_ordered::text,
        sol.price_uom_ptr AS uom,
        sol.price::text,
        sol.extended_price::text
      FROM agility_so_lines sol
      WHERE sol.is_deleted = false
        AND sol.system_id = ${h.system_id}
        AND sol.so_id::text = ${so}
      ORDER BY sol.sequence
    `;

    const lines: MobileOrderLine[] = lineRows.map((r) => ({
      sequence: r.sequence,
      item: r.item,
      description: r.description,
      qty_ordered: r.qty_ordered != null ? parseFloat(r.qty_ordered) : null,
      uom: r.uom,
      price: r.price != null ? parseFloat(r.price) : null,
      extended_price: r.extended_price != null ? parseFloat(r.extended_price) : null,
    }));

    const status = deriveMobileStatus(h.so_status);
    const total = lines.reduce((s, l) => s + (l.extended_price ?? 0), 0);

    return NextResponse.json({
      so_number: h.so_id,
      system_id: h.system_id,
      status,
      so_status: h.so_status ?? '',
      sale_type: h.sale_type,
      customer_name: h.customer_name,
      customer_code: h.customer_code,
      reference: h.reference,
      po_number: h.po_number,
      expect_date: h.expect_date,
      created_date: h.created_date,
      ship_via: h.ship_via,
      branch_code: h.branch_code,
      address_1: h.shipto_address_1,
      city: h.shipto_city,
      state: h.shipto_state,
      total,
      timeline: buildTimeline(status),
      lines,
    });
  } catch (err) {
    console.error('[sales/mobile/orders/[so] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
