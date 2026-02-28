import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb, schema } from '../../../db/index';
import { eq, desc, ilike, or, and } from 'drizzle-orm';

function dbError(err: unknown) {
  if (
    err instanceof Error &&
    err.message.includes('DATABASE_URL')
  ) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[bids API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/bids  – list bids (with optional search + filter)
// ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const status = searchParams.get('status') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();

    const conditions = [];

    // Non-admin users only see their own bids
    const userRole = (session.user as { role?: string }).role ?? 'estimator';
    if (userRole !== 'admin') {
      // filter by estimator name as a fallback (estimatorId not always set)
      conditions.push(eq(schema.bids.estimatorName, session.user?.name ?? ''));
    }

    if (status && status !== 'all') {
      conditions.push(eq(schema.bids.status, status));
    }

    if (q) {
      conditions.push(
        or(
          ilike(schema.bids.jobName, `%${q}%`),
          ilike(schema.bids.customerName, `%${q}%`),
          ilike(schema.bids.estimatorName, `%${q}%`),
          ilike(schema.bids.bidNumber, `%${q}%`)
        )
      );
    }

    const rows = await db
      .select({
        id: schema.bids.id,
        bidNumber: schema.bids.bidNumber,
        jobName: schema.bids.jobName,
        customerName: schema.bids.customerName,
        estimatorName: schema.bids.estimatorName,
        branch: schema.bids.branch,
        status: schema.bids.status,
        createdAt: schema.bids.createdAt,
        updatedAt: schema.bids.updatedAt,
        version: schema.bids.version,
      })
      .from(schema.bids)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.bids.updatedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ bids: rows });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/bids  – create a new bid
// ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    jobName: string;
    customerCode?: string;
    customerName?: string;
    estimatorName: string;
    branch: string;
    inputs: unknown;
    lineItems?: unknown;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.jobName || !body.estimatorName || !body.branch) {
    return NextResponse.json(
      { error: 'jobName, estimatorName, and branch are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    // Generate bid number: BID-YYYY-NNNN
    const year = new Date().getFullYear();
    const countRows = await db
      .select({ id: schema.bids.id })
      .from(schema.bids);
    const bidNumber = `BID-${year}-${String(countRows.length + 1).padStart(4, '0')}`;

    const [bid] = await db
      .insert(schema.bids)
      .values({
        bidNumber,
        jobName: body.jobName,
        customerCode: body.customerCode ?? null,
        customerName: body.customerName ?? null,
        estimatorName: body.estimatorName,
        branch: body.branch,
        inputs: body.inputs as Record<string, unknown>,
        lineItems: (body.lineItems as Record<string, unknown>[]) ?? null,
        notes: body.notes ?? null,
        status: 'draft',
        version: 1,
        createdBy: session.user?.id ?? null,
        estimatorId: session.user?.id ?? null,
      })
      .returning();

    return NextResponse.json({ bid }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
