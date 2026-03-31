import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import {
  legacyBid,
  legacyCustomer,
  legacyEstimator,
  legacyBidActivity,
  legacyBidFile,
  legacyBidField,
  legacyBidValue,
} from '../../../../db/schema-legacy';
import { eq, and, asc } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[legacy-bids/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

type RouteContext = { params: Promise<{ id: string }> };

// ──────────────────────────────────────────────────────────
// GET /api/legacy-bids/:id  – full bid detail
// ──────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Main bid with joins
    const rows = await db
      .select({
        bid: legacyBid,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
        estimatorName: legacyEstimator.estimatorName,
      })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .leftJoin(legacyEstimator, eq(legacyBid.estimatorId, legacyEstimator.estimatorID))
      .where(eq(legacyBid.id, bidId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    const { bid, customerName, customerCode, estimatorName } = rows[0];

    // Files
    const files = await db
      .select()
      .from(legacyBidFile)
      .where(eq(legacyBidFile.bidId, bidId));

    // Dynamic field values
    const dynamicValues = await db
      .select({
        fieldId: legacyBidValue.fieldId,
        value: legacyBidValue.value,
        fieldName: legacyBidField.name,
        fieldType: legacyBidField.fieldType,
        category: legacyBidField.category,
      })
      .from(legacyBidValue)
      .leftJoin(legacyBidField, eq(legacyBidValue.fieldId, legacyBidField.id))
      .where(eq(legacyBidValue.bidId, bidId));

    // Activity log
    const activity = await db
      .select()
      .from(legacyBidActivity)
      .where(eq(legacyBidActivity.bidId, bidId))
      .orderBy(asc(legacyBidActivity.timestamp));

    // Log view activity
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyBidActivity).values({
        userId,
        bidId,
        action: 'viewed',
      });
    }

    return NextResponse.json({
      ...bid,
      customerName,
      customerCode,
      estimatorName,
      files,
      dynamicValues,
      activity,
    });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/legacy-bids/:id  – update bid
// ──────────────────────────────────────────────────────────
export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Build update object from allowed fields
    const updates: Record<string, unknown> = {};
    const allowedFields = [
      'planType', 'customerId', 'salesRepId', 'projectName', 'estimatorId',
      'status', 'dueDate', 'bidDate', 'flexibleBidDate',
      'includeSpecs', 'includeFraming', 'includeSiding', 'includeShingle',
      'includeDeck', 'includeTrim', 'includeWindow', 'includeDoor',
      'framingNotes', 'sidingNotes', 'deckNotes', 'trimNotes',
      'windowNotes', 'doorNotes', 'shingleNotes', 'notes', 'jobId',
    ];

    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'dueDate' || field === 'bidDate') {
          updates[field] = body[field] ? new Date(body[field] as string) : null;
        } else {
          updates[field] = body[field];
        }
      }
    }

    // Auto-set completion date
    if (body.status === 'Complete') {
      updates.completionDate = new Date();
    }

    updates.lastUpdatedBy = session.user.name ?? 'Unknown';
    updates.lastUpdatedAt = new Date();

    const [updated] = await db
      .update(legacyBid)
      .set(updates)
      .where(eq(legacyBid.id, bidId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    // Handle dynamic field values
    if (body.dynamicValues && typeof body.dynamicValues === 'object') {
      const dynVals = body.dynamicValues as Record<string, string>;
      for (const [fieldIdStr, value] of Object.entries(dynVals)) {
        const fieldId = parseInt(fieldIdStr, 10);
        if (isNaN(fieldId)) continue;

        // Upsert: check if exists
        const existing = await db
          .select({ id: legacyBidValue.id })
          .from(legacyBidValue)
          .where(
            and(
              eq(legacyBidValue.bidId, bidId),
              eq(legacyBidValue.fieldId, fieldId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(legacyBidValue)
            .set({ value })
            .where(eq(legacyBidValue.id, existing[0].id));
        } else {
          await db
            .insert(legacyBidValue)
            .values({ bidId, fieldId, value });
        }
      }
    }

    // Log activity
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyBidActivity).values({
        userId,
        bidId,
        action: 'updated',
      });
    }

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/legacy-bids/:id  – delete bid
// ──────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  try {
    const db = getDb();

    const [deleted] = await db
      .delete(legacyBid)
      .where(eq(legacyBid.id, bidId))
      .returning({ id: legacyBid.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
