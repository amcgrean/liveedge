import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
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
  branchCode: string;
  shipmentNum: number | string;
  stopId: number | string;
  status?: 'delivered' | 'skipped';
  shipDate?: string;
  notes?: string;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { so_number: soNumber } = await context.params;

  let body: DeliverBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.branchCode || !body.stopId) {
    return NextResponse.json({ error: 'branchCode and stopId are required' }, { status: 400 });
  }

  const stopStatus = body.status === 'skipped' ? 'skipped' : 'delivered';
  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;
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
      WHERE id = ${Number(body.stopId)}
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
