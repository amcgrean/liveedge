import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getMobileSession } from '../../../../../../src/lib/mobile-auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';
import { notifyRouteCompletedIfLastStop } from '../../../../../../src/lib/dispatch/route-completion';

/**
 * POST /api/dispatch/orders/:so_number/deliver
 *
 * Marks a delivery as complete:
 *  1. Calls Agility ShipmentInfoUpdate with ShipmentStatusFlag "D" (Delivered)
 *  2. Updates the dispatch_route_stops row to status "delivered"
 *
 * Body:
 *   branchCode:   string  — e.g. "20GR"
 *   shipmentNum:  number  — shipment number (usually 1)
 *   stopId:       number  — dispatch_route_stops.id to update
 *   shipDate?:    string  — yyyy-mm-dd (defaults to today)
 *   notes?:       string
 */

type RouteContext = { params: Promise<{ so_number: string }> };

interface DeliverBody {
  branchCode?: string;
  shipmentNum?: number | string;
  stopId?: number | string;
  // Web payload uses `status: 'delivered'|'skipped'`. Mobile app uses
  // `type: 'deliver'|'skip'`. Both map to the same stop status.
  status?: 'delivered' | 'skipped';
  type?: 'deliver' | 'skip';
  shipDate?: string;
  notes?: string;
  // Mobile-only — R2 keys for already-uploaded POD photos. Logged for audit;
  // not currently persisted server-side until a pod_photos table exists.
  photo_keys?: string[];
  timestamp?: string;
}

export async function POST(req: NextRequest, context: RouteContext) {
  // Accept both NextAuth cookies (web) and mobile Bearer tokens.
  const mobile = await getMobileSession(req);
  const session = mobile ?? (await auth());
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number: soNumber } = await context.params;

  let body: DeliverBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Branch: take from body if web caller supplied it, else fall back to the
  // signed-in user's branch (mobile drivers never see other branches).
  const branchCode = body.branchCode || session.user.branch || '';
  if (!branchCode) {
    return NextResponse.json({ error: 'branchCode is required' }, { status: 400 });
  }

  // stopId: web supplies it; mobile only knows the SO number, so resolve the
  // most recent matching dispatch_route_stops row for this branch.
  let stopId: number | null = body.stopId ? Number(body.stopId) : null;
  if (!stopId) {
    try {
      const sql = getErpSql();
      const rows = await sql<{ id: number }[]>`
        SELECT s.id
        FROM dispatch_route_stops s
        JOIN dispatch_routes r ON r.id = s.route_id
        WHERE s.so_id = ${soNumber}
          AND r.branch_code = ${branchCode}
        ORDER BY r.route_date DESC, s.id DESC
        LIMIT 1
      `;
      stopId = rows[0]?.id ?? null;
    } catch (err) {
      console.error(`[deliver/${soNumber}] stop lookup failed:`, err);
    }
  }
  if (!stopId) {
    return NextResponse.json({ error: 'No matching stop found for SO' }, { status: 404 });
  }

  if (body.photo_keys && Array.isArray(body.photo_keys) && body.photo_keys.length > 0) {
    console.log(`[deliver/${soNumber}] received ${body.photo_keys.length} POD photo key(s) from ${mobile ? 'mobile' : 'web'} caller`);
  }

  const requestedStatus = body.status ?? (body.type === 'skip' ? 'skipped' : body.type === 'deliver' ? 'delivered' : undefined);
  const stopStatus = requestedStatus === 'skipped' ? 'skipped' : 'delivered';
  const agilityBranch = BRANCH_MAP[branchCode] ?? branchCode;
  let agilitySuccess = false;
  let agilityError = '';

  // 1. Push to Agility only for delivered (not skipped)
  if (stopStatus === 'delivered' && isAgilityConfigured()) {
    try {
      await agilityApi.shipmentInfoUpdate({
        OrderID:            soNumber,
        ShipmentNumber:     Number(body.shipmentNum) || 1,
        UpdateAllPickFiles: true,
        ShipmentStatusFlag: 'Delivered' as const,
      }, { branch: agilityBranch });
      agilitySuccess = true;
    } catch (err) {
      agilityError = err instanceof AgilityApiError ? err.message : String(err);
      console.error(`[deliver/${soNumber}] Agility ShipmentInfoUpdate failed:`, agilityError);
      // Non-fatal — still mark locally
    }
  }

  // 2. Update stop status in dispatch_route_stops
  let routeId: number | null = null;
  try {
    const sql = getErpSql();
    const updated = await sql<{ route_id: number | null }[]>`
      UPDATE dispatch_route_stops
      SET status = ${stopStatus},
          notes  = COALESCE(${body.notes ?? null}, notes)
      WHERE id = ${stopId}
      RETURNING route_id
    `;
    routeId = updated[0]?.route_id ?? null;
  } catch (err) {
    console.error(`[deliver/${soNumber}] stop update failed:`, err);
    return NextResponse.json({ error: 'Failed to update stop status' }, { status: 500 });
  }

  // 3. Best-effort: if this was the last open stop on the route, notify dispatch.
  //    Wrapped so a notification failure never bubbles up to the deliver caller.
  if (routeId) {
    try {
      await notifyRouteCompletedIfLastStop({ routeId, completedSoNumber: soNumber });
    } catch (err) {
      console.error(`[deliver/${soNumber}] route-completion notify failed:`, err);
    }
  }

  return NextResponse.json({
    success: true,
    soNumber,
    status: stopStatus,
    agilitySuccess,
    ...(agilityError ? { agilityWarning: agilityError } : {}),
  });
}
