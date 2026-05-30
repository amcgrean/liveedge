import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../../src/lib/mobile-auth';
import { getErpSql } from '../../../../../../db/supabase';

/**
 * POST /api/dispatch/orders/:so_number/claim
 *
 * Ensures a dispatch_route_stops row exists for the given SO so the caller
 * can submit POD photos and mark delivered through the existing /deliver
 * flow. Used by the driver app's "Take this stop" button when the SO isn't
 * already on a dispatch route.
 *
 * The created stop attaches to a per-(branch, date, claimed_by) ad-hoc
 * dispatch_routes row — one ad-hoc route per user per day. That keeps
 * a clear audit trail without polluting real planned routes.
 *
 * Returns the (existing or freshly created) stop so the client can fold
 * it into its local state without a follow-up GET.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ so_number: string }> }
) {
  const authResult = await requireSessionOrMobile(req, 'dispatch.view', 'dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { so_number } = await params;
  if (!so_number?.trim()) {
    return NextResponse.json({ error: 'so_number required' }, { status: 400 });
  }
  const soNumber = so_number.trim();

  let body: { branchCode?: string; shipmentNum?: number; notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const branchCode = (body.branchCode ?? session.user.branch ?? '').trim();
  if (!branchCode) {
    return NextResponse.json({ error: 'branchCode is required (no branch on session)' }, { status: 400 });
  }

  const shipmentNum = body.shipmentNum ?? 1;
  const today = new Date().toISOString().slice(0, 10);
  const userId = session.user.id;
  const userName = session.user.name ?? session.user.email ?? `user-${userId}`;
  const adhocRouteName = `Ad-hoc · ${userName}`;

  try {
    const sql = getErpSql();

    // 1. Verify the SO exists for this branch (avoid creating stops for
    //    non-existent orders, and to confirm the branch is correct).
    type HeaderRow = { so_id: string };
    const so = await sql<HeaderRow[]>`
      SELECT so_id::text AS so_id
      FROM agility_so_header
      WHERE so_id::text = ${soNumber}
        AND system_id = ${branchCode}
        AND is_deleted = false
      LIMIT 1
    `;
    if (so.length === 0) {
      return NextResponse.json({ error: 'SO not found for this branch' }, { status: 404 });
    }

    // 2. Existing stop? Return it without creating a duplicate.
    type StopRow = {
      id: number; route_id: number; shipment_num: number; status: string; notes: string | null;
    };
    const existing = await sql<StopRow[]>`
      SELECT s.id, s.route_id, s.shipment_num, s.status, s.notes
      FROM dispatch_route_stops s
      JOIN dispatch_routes r ON r.id = s.route_id
      WHERE s.so_id = ${soNumber}
        AND r.branch_code = ${branchCode}
      ORDER BY r.route_date DESC, s.id DESC
      LIMIT 1
    `;
    if (existing[0]) {
      return NextResponse.json({
        claimed: false,
        already_existed: true,
        stop: existing[0],
      });
    }

    // 3. Find-or-create an ad-hoc route for (branch, today, user).
    //    notes field carries the claimed_by user id so future audits can
    //    figure out who owns the ad-hoc bucket.
    type RouteRow = { id: number };
    let route = await sql<RouteRow[]>`
      SELECT id
      FROM dispatch_routes
      WHERE branch_code = ${branchCode}
        AND route_date = ${today}::date
        AND route_name = ${adhocRouteName}
      LIMIT 1
    `;
    let routeId = route[0]?.id;
    if (!routeId) {
      const inserted = await sql<RouteRow[]>`
        INSERT INTO dispatch_routes
          (route_date, route_code, route_name, branch_code, driver_name, truck_id, notes, status, created_at, updated_at)
        VALUES
          (${today}::date, 'ADHOC', ${adhocRouteName}, ${branchCode},
           ${userName}, NULL,
           ${`Ad-hoc route created via SO claim by user ${userId}`},
           'in_progress', NOW(), NOW())
        RETURNING id
      `;
      routeId = inserted[0].id;
    }

    // 4. Pick the next sequence number on this route and insert the stop.
    type SeqRow = { max_seq: number | null };
    const [seqRow] = await sql<SeqRow[]>`
      SELECT MAX(sequence) AS max_seq FROM dispatch_route_stops WHERE route_id = ${routeId}
    `;
    const sequence = (seqRow?.max_seq ?? 0) + 10;

    const inserted = await sql<StopRow[]>`
      INSERT INTO dispatch_route_stops
        (route_id, so_id, shipment_num, sequence, status, notes, created_at)
      VALUES
        (${routeId}, ${soNumber}, ${shipmentNum}, ${sequence}, 'pending',
         ${`Claimed by ${userName} (user ${userId})${body.notes ? ' — ' + body.notes : ''}`},
         NOW())
      RETURNING id, route_id, shipment_num, status, notes
    `;

    return NextResponse.json({
      claimed: true,
      already_existed: false,
      stop: inserted[0],
    });
  } catch (err) {
    console.error(`[dispatch/orders/${soNumber}/claim POST]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
