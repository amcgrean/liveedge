import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';

/**
 * POST /api/sales/orders/:so_number/push-to-erp
 *
 * Updates an existing Agility Sales Order — currently supports:
 *   - Adding a message/note to the order
 *   - Cancelling the order
 *
 * Body:
 *   action:      'message' | 'cancel'
 *   branchCode:  string
 *   message?:    string   — required when action = 'message'
 *
 * Designed for the Sales Order detail page action panel.
 */

type RouteContext = { params: Promise<{ so_number: string }> };

interface ActionBody {
  action: 'message' | 'cancel';
  branchCode: string;
  message?: string;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  const { so_number: soNumber } = await context.params;

  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.action || !body.branchCode) {
    return NextResponse.json({ error: 'action and branchCode are required' }, { status: 400 });
  }

  const agilityBranch = BRANCH_MAP[body.branchCode] ?? body.branchCode;
  const branchOpt = { branch: agilityBranch };

  try {
    if (body.action === 'message') {
      if (!body.message?.trim()) {
        return NextResponse.json({ error: 'message is required for action=message' }, { status: 400 });
      }

      // Add a message/note to the sales order
      await agilityApi.call(
        'Orders',
        'SalesOrderMessageCreate',
        {
          OrderID:     soNumber,
          MessageText: body.message.trim(),
        },
        branchOpt
      );

      return NextResponse.json({
        success: true,
        action: 'message',
        soNumber,
        message: 'Note added to sales order in Agility',
      });
    }

    if (body.action === 'cancel') {
      // Verify the SO exists and is cancellable (not already closed/invoiced)
      const sql = getErpSql();
      type SoRow = { so_status: string | null };
      const soRows = await sql<SoRow[]>`
        SELECT so_status FROM agility_so_header
        WHERE so_id = ${soNumber} AND system_id = ${body.branchCode} AND is_deleted = false
        LIMIT 1
      `;

      if (soRows.length === 0) {
        return NextResponse.json({ error: `SO ${soNumber} not found` }, { status: 404 });
      }

      const status = (soRows[0].so_status ?? '').toUpperCase();
      if (['I', 'C'].includes(status)) {
        return NextResponse.json(
          { error: `SO ${soNumber} is already ${status === 'I' ? 'invoiced' : 'closed'} and cannot be cancelled` },
          { status: 422 }
        );
      }

      await agilityApi.salesOrderCancel(soNumber, branchOpt);

      return NextResponse.json({
        success: true,
        action: 'cancel',
        soNumber,
        message: `Sales Order ${soNumber} cancelled in Agility`,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility: ${err.message}` }, { status: 422 });
    }
    console.error(`[sales/orders/${soNumber}/push-to-erp POST]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
