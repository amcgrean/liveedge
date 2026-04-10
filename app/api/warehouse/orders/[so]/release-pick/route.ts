import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';

/**
 * POST /api/warehouse/orders/:so/release-pick
 *
 * Creates a pick file in Agility for a specific SO from the dispatch board.
 * Same logic as /api/warehouse/picks/create-pick-file but keyed by SO in the URL
 * for use by the dispatch board's stop detail panel.
 *
 * Body:
 *   branchCode:       string   — e.g. '20GR'
 *   pickType?:        string   — optional Agility pick type code
 *   printPickTicket?: boolean  — default false
 */

type RouteContext = { params: Promise<{ so: string }> };

interface ReleaseBody {
  branchCode: string;
  pickType?: string;
  printPickTicket?: boolean;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const roles: string[] = (session.user as { roles?: string[] }).roles ?? [];
  const role = (session.user as { role?: string }).role ?? '';
  const canRelease =
    role === 'admin' ||
    roles.some((r) => ['admin', 'supervisor', 'ops', 'warehouse', 'dispatch'].includes(r));

  if (!canRelease) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  const { so: soNumber } = await context.params;
  if (!soNumber) return NextResponse.json({ error: 'SO number required' }, { status: 400 });

  let body: ReleaseBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.branchCode) return NextResponse.json({ error: 'branchCode required' }, { status: 400 });

  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;

  try {
    // Verify SO exists and is pickable
    const sql = getErpSql();
    type SoRow = { so_status: string | null; cust_name: string | null; sale_type: string | null };
    const soRows = await sql<SoRow[]>`
      SELECT so_status, cust_name, sale_type
      FROM agility_so_header
      WHERE so_id = ${soNumber}
        AND system_id = ${body.branchCode}
        AND is_deleted = false
      LIMIT 1
    `;

    if (soRows.length === 0) {
      return NextResponse.json({ error: `SO ${soNumber} not found` }, { status: 404 });
    }

    const soStatus = (soRows[0].so_status ?? '').toUpperCase();
    if (!['K', 'P', 'S'].includes(soStatus)) {
      return NextResponse.json(
        { error: `SO ${soNumber} status "${soStatus}" is not pickable (need K, P, or S)` },
        { status: 422 }
      );
    }

    const result = await agilityApi.pickFileCreate(
      {
        OrderID:         soNumber,
        PickType:        body.pickType,
        PrintPickTicket: body.printPickTicket ?? false,
      },
      { branch: agilityBranch }
    );

    return NextResponse.json({
      success:    true,
      pickFileId: result.PickFileID,
      soNumber,
      customer:   soRows[0].cust_name ?? '',
      saleType:   soRows[0].sale_type ?? '',
      message:    `Pick file ${result.PickFileID} created for SO ${soNumber}`,
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error(`[warehouse/orders/${soNumber}/release-pick POST]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
