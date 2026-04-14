import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../../src/lib/agility-api';
import { getErpSql } from '../../../../../../db/supabase';

/**
 * GET /api/purchasing/pos/:po/live
 *
 * Returns live PO data direct from the Agility API, merged with mirror table data.
 * Used by the PO check-in workflow to show current line quantities and received status.
 *
 * Falls back gracefully to the mirror table if the API is not configured.
 *
 * Query params:
 *   branch  — branch code (e.g. '20GR'), required for API call
 */

type RouteContext = { params: Promise<{ po: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { po } = await context.params;
  if (!po) return NextResponse.json({ error: 'PO number required' }, { status: 400 });

  const branchCode = req.nextUrl.searchParams.get('branch') ?? '';

  // ── Mirror table data (always available) ────────────────────────────────────
  const sql = getErpSql();

  type PoHeaderRow = {
    po_id: string;
    supplier_id: string | null;
    supplier_name: string | null;
    system_id: string;
    status: string | null;
    expect_date: string | null;
    order_date: string | null;
    is_deleted: boolean;
  };

  type PoLineRow = {
    sequence: number;
    item_code: string | null;
    description: string | null;
    qty_ordered: number | null;
    qty_received: number | null;
    uom: string | null;
    unit_cost: number | null;
  };

  const [headerRows, lineRows] = await Promise.all([
    sql<PoHeaderRow[]>`
      SELECT po_id, supplier_id, supplier_name, system_id, status,
             expect_date::text, order_date::text, is_deleted
      FROM agility_po_header
      WHERE po_id = ${po}
        ${branchCode ? sql`AND system_id = ${branchCode}` : sql``}
      LIMIT 1
    `,
    sql<PoLineRow[]>`
      SELECT sequence, item_code, description,
             qty_ordered, qty_received, uom, unit_cost
      FROM agility_po_lines
      WHERE po_id = ${po}
        ${branchCode ? sql`AND system_id = ${branchCode}` : sql``}
        AND is_deleted = false
      ORDER BY sequence
    `,
  ]);

  if (headerRows.length === 0) {
    return NextResponse.json({ error: `PO ${po} not found` }, { status: 404 });
  }

  const mirrorData = {
    source:     'mirror' as const,
    header:     headerRows[0],
    lines:      lineRows,
    lineCount:  lineRows.length,
    totalQtyOrdered:  lineRows.reduce((s, l) => s + (Number(l.qty_ordered) || 0), 0),
    totalQtyReceived: lineRows.reduce((s, l) => s + (Number(l.qty_received) || 0), 0),
  };

  // ── Live API data (if configured) ───────────────────────────────────────────
  if (!isAgilityConfigured() || !branchCode) {
    return NextResponse.json({
      ...mirrorData,
      liveData: null,
      note: isAgilityConfigured()
        ? 'branch parameter required for live API data'
        : 'Agility API not configured — showing mirror table data only',
    });
  }

  const agilityBranch = BRANCH_MAP[branchCode] ?? branchCode;

  try {
    const liveRaw = await agilityApi.purchaseOrderGet(po, { branch: agilityBranch });

    // Response shape (confirmed from Postman v619 collection):
    // response.PurchaseOrderResponse.dsPurchaseOrderResponse.dtPurchaseOrderHeader[]
    // response.PurchaseOrderResponse.dsPurchaseOrderResponse.dtPurchaseOrderDetail[]
    const ds = (
      (liveRaw as Record<string, unknown>).PurchaseOrderResponse as
      Record<string, { dtPurchaseOrderHeader?: unknown[]; dtPurchaseOrderDetail?: unknown[] }> | undefined
    )?.dsPurchaseOrderResponse;

    const liveHeader = ds?.dtPurchaseOrderHeader?.[0] ?? null;
    const liveLines  = ds?.dtPurchaseOrderDetail ?? [];

    return NextResponse.json({
      ...mirrorData,
      source:   'live+mirror' as const,
      liveData: {
        header: liveHeader,
        lines:  liveLines,
      },
    });
  } catch (err) {
    // Don't fail the request if live fetch fails — fall back to mirror data
    const errorMsg = err instanceof AgilityApiError ? err.message : 'Live API unavailable';
    console.warn(`[purchasing/pos/${po}/live] Live API fallback:`, errorMsg);

    return NextResponse.json({
      ...mirrorData,
      liveData: null,
      liveError: errorMsg,
      note: 'Showing mirror table data — live API call failed',
    });
  }
}
