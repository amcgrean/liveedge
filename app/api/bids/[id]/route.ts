import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[bids/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/bids/[id]
// ──────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = getDb();
    const [bid] = await db
      .select()
      .from(schema.bids)
      .where(eq(schema.bids.id, id))
      .limit(1);

    if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    // Non-admins can only see their own bids
    const userRole = (session.user as { role?: string }).role ?? 'estimator';
    if (
      userRole !== 'admin' &&
      bid.estimatorName !== session.user?.name
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ bid });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/bids/[id]  – update bid inputs / status / notes
// ──────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body: {
    inputs?: unknown;
    lineItems?: unknown;
    bidSummary?: unknown;
    status?: string;
    notes?: string;
    changeNote?: string;
    jobName?: string;
    customerName?: string;
    customerCode?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.bids)
      .where(eq(schema.bids.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const userRole = (session.user as { role?: string }).role ?? 'estimator';
    if (userRole !== 'admin' && existing.estimatorName !== session.user?.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Save a version snapshot before overwriting
    if (body.inputs) {
      await db.insert(schema.bidVersions).values({
        bidId: id,
        version: existing.version,
        inputs: existing.inputs as Record<string, unknown>,
        lineItems: existing.lineItems as Record<string, unknown>[] | null,
        changeNote: body.changeNote ?? null,
        changedBy: session.user?.id ?? null,
      });
    }

    const updateData: Partial<typeof schema.bids.$inferInsert> = {
      updatedAt: new Date(),
      version: existing.version + 1,
    };

    if (body.inputs !== undefined) updateData.inputs = body.inputs as Record<string, unknown>;
    if (body.lineItems !== undefined) updateData.lineItems = body.lineItems as Record<string, unknown>[];
    if (body.bidSummary !== undefined) updateData.bidSummary = body.bidSummary as Record<string, unknown>;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.jobName !== undefined) updateData.jobName = body.jobName;
    if (body.customerName !== undefined) updateData.customerName = body.customerName;
    if (body.customerCode !== undefined) updateData.customerCode = body.customerCode;

    // Set status timestamps
    if (body.status === 'won' && !existing.wonAt) updateData.wonAt = new Date();
    if (body.status === 'lost' && !existing.lostAt) updateData.lostAt = new Date();
    if (body.status === 'submitted' && !existing.submittedAt) updateData.submittedAt = new Date();

    const [updated] = await db
      .update(schema.bids)
      .set(updateData)
      .where(eq(schema.bids.id, id))
      .returning();

    return NextResponse.json({ bid: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/bids/[id]
// ──────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.bids)
      .where(eq(schema.bids.id, id))
      .limit(1);

    if (!existing) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    const userRole = (session.user as { role?: string }).role ?? 'estimator';
    if (userRole !== 'admin' && existing.estimatorName !== session.user?.name) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft delete: archive instead of hard delete
    await db
      .update(schema.bids)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(schema.bids.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
