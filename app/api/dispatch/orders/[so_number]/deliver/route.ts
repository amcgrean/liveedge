import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';

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
  shipmentNum: number;
  stopId: number;
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

  const today = new Date().toISOString().slice(0, 10);
  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;
  let agilitySuccess = false;
  let agilityError = '';

  // 1. Push status to Agility (non-fatal if API not configured)
  if (isAgilityConfigured()) {
    try {
      // Log exactly what we're sending to help diagnose parse errors
      const shipPayload = {
        OrderID:            soNumber,
        ShipmentNumber:     body.shipmentNum ?? 1,
        UpdateAllPickFiles: true,
        ShipmentStatusFlag: 'Delivered',
      };
      console.log('[deliver] ShipmentInfoUpdate payload:', JSON.stringify(shipPayload), 'branch:', agilityBranch);
      await agilityApi.shipmentInfoUpdate(shipPayload, { branch: agilityBranch });
      agilitySuccess = true;
    } catch (err) {
      agilityError = err instanceof AgilityApiError ? err.message : String(err);
      console.error(`[deliver/${soNumber}] Agility ShipmentInfoUpdate failed:`, agilityError);
      // Non-fatal — still mark delivered locally
    }
  }

  // 2. Update stop status in dispatch_route_stops
  try {
    const sql = getErpSql();
    await sql`
      UPDATE dispatch_route_stops
      SET status = 'delivered'
      WHERE id = ${body.stopId}
    `;
  } catch (err) {
    console.error(`[deliver/${soNumber}] stop update failed:`, err);
    return NextResponse.json({ error: 'Failed to update stop status' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    soNumber,
    agilitySuccess,
    ...(agilityError ? { agilityWarning: agilityError } : {}),
  });
}
