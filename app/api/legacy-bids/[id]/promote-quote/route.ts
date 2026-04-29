import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyBid, legacyBidActivity } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import { agilityApi, isAgilityConfigured, BRANCH_MAP, AgilityApiError } from '../../../../../src/lib/agility-api';

/**
 * POST /api/legacy-bids/:id/promote-quote
 *
 * Promotes the Agility quote linked to this bid into a confirmed Sales Order.
 * Requires the bid to have been previously pushed as a quote (agilityQuoteId set).
 * Stores the resulting OrderID as agilitySoId on the bid.
 *
 * Body: (empty — uses the stored quote ID)
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });

  if (!isAgilityConfigured()) {
    return NextResponse.json({ error: 'Agility API not configured' }, { status: 503 });
  }

  try {
    const db = getDb();

    const rows = await db
      .select({
        agilityQuoteId: legacyBid.agilityQuoteId,
        agilitySoId:    legacyBid.agilitySoId,
        branchId:       legacyBid.branchId,
      })
      .from(legacyBid)
      .where(eq(legacyBid.id, bidId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const { agilityQuoteId, agilitySoId, branchId } = rows[0];
    const agilityBranch = branchId ? (BRANCH_MAP[branchId] ?? branchId) : '';

    if (!agilityQuoteId) {
      return NextResponse.json(
        { error: 'No quote linked to this bid. Push to ERP as a quote first.' },
        { status: 422 }
      );
    }

    if (agilitySoId) {
      return NextResponse.json(
        { error: `Quote already promoted to Sales Order ${agilitySoId}.`, agilitySoId },
        { status: 409 }
      );
    }

    // Release quote → Sales Order in Agility
    // QuoteRelease does not return a new SO ID (per Postman v619) — the quote ID becomes the SO ID
    await agilityApi.quoteRelease(agilityQuoteId, { branch: agilityBranch });
    const soId = agilityQuoteId;  // quote ID and SO ID are the same in Agility

    // Store SO ID on bid
    await db
      .update(legacyBid)
      .set({ agilitySoId: soId, erpPushedAt: new Date() })
      .where(eq(legacyBid.id, bidId));

    // Audit
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      db.insert(legacyBidActivity).values({
        userId,
        bidId,
        action: `Quote ${agilityQuoteId} promoted to Sales Order ${soId}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      agilitySoId: soId,
      agilityQuoteId,
      message: `Quote ${agilityQuoteId} → Sales Order ${soId}`,
    });
  } catch (err) {
    if (err instanceof AgilityApiError) {
      return NextResponse.json({ error: `Agility error: ${err.message}` }, { status: 422 });
    }
    console.error('[promote-quote POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
