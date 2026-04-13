import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
import { legacyBid, legacyCustomer, legacyBranch, legacyBidActivity } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../src/lib/agility-api';
import type { LineItem } from '../../../../../src/types/estimate';

/**
 * POST /api/legacy-bids/:id/push-to-erp
 *
 * Creates a Quote or Sales Order in the Agility ERP from a bid's line items.
 * Stores the returned QuoteID/OrderID on the bid record.
 *
 * Body:
 *   mode:            'quote' | 'order'   — create quote or direct SO
 *   shipToSequence:  number              — ship-to seq from customer's address list
 *   saleType:        string              — e.g. 'DELIVERY', 'WILLCALL'
 *   expectDate:      string              — yyyy-mm-dd
 *   reference?:      string              — PO# or job ref (defaults to project name)
 *   notes?:          string
 *
 * Requires: bid must have a linked takeoff session with calculated line items.
 * Requires: AGILITY_API_URL / USERNAME / PASSWORD env vars set.
 */

type RouteContext = { params: Promise<{ id: string }> };

interface PushBody {
  mode: 'quote' | 'order';
  shipToSequence: number;
  saleType: string;
  expectDate: string;
  reference?: string;
  notes?: string;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });

  // Check API is configured before doing any DB work
  if (!isAgilityConfigured()) {
    return NextResponse.json(
      { error: 'Agility API not configured. Contact your administrator.' },
      { status: 503 }
    );
  }

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.mode || !['quote', 'order'].includes(body.mode)) {
    return NextResponse.json({ error: 'mode must be "quote" or "order"' }, { status: 400 });
  }
  if (!body.shipToSequence || !body.saleType || !body.expectDate) {
    return NextResponse.json(
      { error: 'shipToSequence, saleType, and expectDate are required' },
      { status: 400 }
    );
  }

  try {
    const db = getDb();

    // ── Load bid + customer code + branch code ──────────────────────────────
    const rows = await db
      .select({
        bid:          legacyBid,
        customerCode: legacyCustomer.customerCode,
        branchCode:   legacyBranch.branchCode,
      })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .leftJoin(legacyBranch, eq(legacyBid.branchId, legacyBranch.branchId))
      .where(eq(legacyBid.id, bidId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const { bid, customerCode, branchCode } = rows[0];

    if (!customerCode) {
      return NextResponse.json(
        { error: 'Bid has no linked customer. Please select a customer before pushing to ERP.' },
        { status: 422 }
      );
    }

    // ── Resolve Agility branch from branchCode ──────────────────────────────
    // branchCode (e.g. "20GR") → BRANCH_MAP → Agility internal branch ID
    // TODO: Update BRANCH_MAP in agility-api.ts once BranchList is confirmed Monday
    const agilityBranch = branchCode ? (BRANCH_MAP[branchCode] ?? branchCode) : '';

    // ── Load linked UUID bids record for line items ─────────────────────────
    const takeoffRows = await db
      .select({
        lineItems: schema.bids.lineItems,
        jobName:   schema.bids.jobName,
      })
      .from(schema.takeoffSessions)
      .leftJoin(schema.bids, eq(schema.takeoffSessions.bidId, schema.bids.id))
      .where(eq(schema.takeoffSessions.legacyBidId, bidId))
      .limit(1);

    const rawLineItems = takeoffRows[0]?.lineItems as LineItem[] | null | undefined;
    const lineItems: LineItem[] = Array.isArray(rawLineItems) ? rawLineItems : [];

    // Filter out items with warnings or dynamic SKUs that aren't resolved
    const pushableItems = lineItems.filter(
      (item) => item.sku && !item.is_dynamic_sku && item.qty > 0
    );

    if (pushableItems.length === 0) {
      return NextResponse.json(
        {
          error:
            'No line items available to push. Open the estimating app, calculate materials, ' +
            'then return here to push to ERP.',
        },
        { status: 422 }
      );
    }

    // ── Map line items to Agility format ────────────────────────────────────
    const agilityLines = pushableItems.map((item) => ({
      ItemID:   item.sku,
      Quantity: item.qty,
      UOM:      item.uom,
      // Price is intentionally omitted — ERP looks up from customer pricing matrix
    }));

    const reference = body.reference?.trim() || bid.projectName;

    // ── Push to Agility ──────────────────────────────────────────────────────
    let erpId: string;
    let erpType: 'quote' | 'order';

    const branchOpt = agilityBranch ? { branch: agilityBranch } : {};

    if (body.mode === 'quote') {
      const result = await agilityApi.quoteCreate(
        {
          CustomerID:      customerCode,
          ShipToSequence:  body.shipToSequence,
          SaleType:        body.saleType,
          Reference:       reference,
          ExpirationDate:  body.expectDate,  // quote expires on bid due date
          Notes:           body.notes ?? '',
          Lines:           agilityLines,
        },
        branchOpt
      );
      erpId   = result.QuoteID;
      erpType = 'quote';
    } else {
      const result = await agilityApi.salesOrderCreate(
        {
          CustomerID:     customerCode,
          ShipToSequence: body.shipToSequence,
          SaleType:       body.saleType,
          ExpectDate:     body.expectDate,
          Reference:      reference,
          Notes:          body.notes ?? '',
          Lines:          agilityLines,
        },
        branchOpt
      );
      erpId   = result.OrderID;
      erpType = 'order';
    }

    // ── Store ERP ID back on the bid ─────────────────────────────────────────
    if (erpType === 'quote') {
      await db
        .update(legacyBid)
        .set({ agilityQuoteId: erpId, erpPushedAt: new Date() })
        .where(eq(legacyBid.id, bidId));
    } else {
      await db
        .update(legacyBid)
        .set({ agilitySoId: erpId, erpPushedAt: new Date() })
        .where(eq(legacyBid.id, bidId));
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyBidActivity).values({
        userId,
        bidId,
        action: `Pushed to ERP as ${erpType === 'quote' ? `Quote ${erpId}` : `Sales Order ${erpId}`}`,
      });
    }

    return NextResponse.json({
      success:       true,
      erpType,
      erpId,
      linesPushed:   agilityLines.length,
      customerCode,
      message:       `${erpType === 'quote' ? 'Quote' : 'Sales Order'} ${erpId} created in Agility.`,
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json(
        { error: `Agility API error: ${err.message}` },
        { status: 422 }
      );
    }
    console.error('[push-to-erp POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
