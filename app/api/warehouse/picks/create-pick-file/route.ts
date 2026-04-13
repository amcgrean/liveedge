import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../db/supabase';

/**
 * POST /api/warehouse/picks/create-pick-file
 *
 * Creates a pick file in the Agility ERP for a given sales order.
 * Called from the dispatch board when a supervisor releases an order for picking.
 *
 * Body:
 *   soNumber:        string   — Agility SO number
 *   branchCode:      string   — e.g. '20GR'
 *   pickType?:       string   — pick type code (branch-specific, leave blank for default)
 *   printPickTicket?: boolean — whether to print the pick ticket in Agility (default false)
 *
 * Returns: { pickFileId, soNumber, message }
 *
 * Note: This creates the pick file in the ERP only.
 * Internal pick assignment tracking (the `pick` table) is separate and
 * remains managed by the kiosk/supervisor workflow.
 */

interface CreatePickFileBody {
  soNumber: string;
  branchCode: string;
  pickType?: string;
  printPickTicket?: boolean;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Must be supervisor, ops, or admin
  const roles: string[] = (session.user as { roles?: string[] }).roles ?? [];
  const role = (session.user as { role?: string }).role ?? '';
  const canCreate =
    role === 'admin' ||
    roles.some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));

  if (!canCreate) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  if (!isAgilityConfigured()) {
    return NextResponse.json(
      { error: 'Agility API not configured' },
      { status: 503 }
    );
  }

  let body: CreatePickFileBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.soNumber?.trim()) {
    return NextResponse.json({ error: 'soNumber is required' }, { status: 400 });
  }
  if (!body.branchCode?.trim()) {
    return NextResponse.json({ error: 'branchCode is required' }, { status: 400 });
  }

  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;

  try {
    // Verify the SO exists and is in a pickable status before calling ERP
    const sql = getErpSql();
    type SoCheckRow = { so_status: string | null; cust_name: string | null };
    const soRows = await sql<SoCheckRow[]>`
      SELECT so_status, cust_name
      FROM agility_so_header
      WHERE so_id = ${body.soNumber}
        AND system_id = ${body.branchCode}
        AND is_deleted = false
      LIMIT 1
    `;

    if (soRows.length === 0) {
      return NextResponse.json(
        { error: `SO ${body.soNumber} not found for branch ${body.branchCode}` },
        { status: 404 }
      );
    }

    const soStatus = (soRows[0].so_status ?? '').toUpperCase();
    if (!['K', 'P', 'S'].includes(soStatus)) {
      return NextResponse.json(
        {
          error: `SO ${body.soNumber} is not in a pickable status (current: ${soStatus}). ` +
            `Only K, P, and S status orders can have pick files created.`,
        },
        { status: 422 }
      );
    }

    // Create pick file in Agility ERP
    const result = await agilityApi.pickFileCreate(
      {
        OrderID:        body.soNumber,
        PickType:       body.pickType,
        PrintPickTicket: body.printPickTicket ?? false,
      },
      { branch: agilityBranch }
    );

    return NextResponse.json({
      success:    true,
      pickFileId: result.PickFileID,
      soNumber:   body.soNumber,
      customer:   soRows[0].cust_name ?? '',
      message:    `Pick file ${result.PickFileID} created for SO ${body.soNumber}.`,
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json(
        { error: `Agility API error: ${err.message}` },
        { status: 422 }
      );
    }
    console.error('[warehouse/picks/create-pick-file POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
