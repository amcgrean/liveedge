import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import {
  legacyBid,
  legacyCustomer,
  legacyEstimator,
  legacyBidActivity,
} from '../../../db/schema-legacy';
import { eq, desc, ilike, or, and, sql, asc } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured.' },
      { status: 503 }
    );
  }
  console.error('[legacy-bids API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/legacy-bids  – list bids with pagination, filter, sort
// ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const status = searchParams.get('status') ?? '';
  const planType = searchParams.get('planType') ?? '';
  const sortBy = searchParams.get('sortBy') ?? 'due_date';
  const sortDir = searchParams.get('sortDir') ?? 'asc';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();
    const conditions = [];

    // Branch filter
    if (branchId) {
      conditions.push(eq(legacyBid.branchId, branchId));
    }

    // Status filter
    if (status && status !== 'all') {
      conditions.push(eq(legacyBid.status, status));
    } else if (!status) {
      // Default: show incomplete (open) bids
      conditions.push(eq(legacyBid.status, 'Incomplete'));
    }

    // Plan type filter (Commercial/Residential)
    if (planType) {
      conditions.push(eq(legacyBid.planType, planType));
    }

    // Search
    if (q) {
      conditions.push(
        or(
          ilike(legacyBid.projectName, `%${q}%`),
          sql`exists (select 1 from customer c where c.id = ${legacyBid.customerId} and c.name ilike ${`%${q}%`})`
        )
      );
    }

    // Sort
    const sortColumn = sortBy === 'log_date' ? legacyBid.logDate
      : sortBy === 'project_name' ? legacyBid.projectName
      : sortBy === 'status' ? legacyBid.status
      : legacyBid.dueDate; // default
    const orderFn = sortDir === 'desc' ? desc : asc;

    const rows = await db
      .select({
        id: legacyBid.id,
        planType: legacyBid.planType,
        projectName: legacyBid.projectName,
        status: legacyBid.status,
        logDate: legacyBid.logDate,
        dueDate: legacyBid.dueDate,
        completionDate: legacyBid.completionDate,
        includeFraming: legacyBid.includeFraming,
        includeSiding: legacyBid.includeSiding,
        includeShingle: legacyBid.includeShingle,
        includeDeck: legacyBid.includeDeck,
        includeTrim: legacyBid.includeTrim,
        includeWindow: legacyBid.includeWindow,
        includeDoor: legacyBid.includeDoor,
        notes: legacyBid.notes,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
        estimatorName: legacyEstimator.estimatorName,
      })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .leftJoin(
        legacyEstimator,
        eq(legacyBid.estimatorId, legacyEstimator.estimatorID)
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);

    // Total count for pagination
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({
      bids: rows,
      total: countResult?.count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/legacy-bids  – create a new legacy bid
// ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const planType = body.planType as string;
  const customerId = body.customerId as number;
  const projectName = body.projectName as string;

  if (!planType || !customerId || !projectName) {
    return NextResponse.json(
      { error: 'planType, customerId, and projectName are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    const [bid] = await db
      .insert(legacyBid)
      .values({
        planType,
        customerId,
        projectName,
        salesRepId: body.salesRepId as number | undefined,
        estimatorId: body.estimatorId as number | undefined,
        status: 'Incomplete',
        dueDate: body.dueDate ? new Date(body.dueDate as string) : new Date(Date.now() + 14 * 86400000),
        flexibleBidDate: (body.flexibleBidDate as boolean) ?? false,
        includeSpecs: (body.includeSpecs as boolean) ?? false,
        includeFraming: (body.includeFraming as boolean) ?? false,
        includeSiding: (body.includeSiding as boolean) ?? false,
        includeShingle: (body.includeShingle as boolean) ?? false,
        includeDeck: (body.includeDeck as boolean) ?? false,
        includeTrim: (body.includeTrim as boolean) ?? false,
        includeWindow: (body.includeWindow as boolean) ?? false,
        includeDoor: (body.includeDoor as boolean) ?? false,
        notes: (body.notes as string) ?? null,
        branchId: branchId ?? (body.branchId as number | undefined),
        jobId: body.jobId as number | undefined,
      })
      .returning();

    // Log activity
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyBidActivity).values({
        userId,
        bidId: bid.id,
        action: 'created',
      });
    }

    return NextResponse.json({ bid }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
