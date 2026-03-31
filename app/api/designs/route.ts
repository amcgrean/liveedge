import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import {
  legacyDesign,
  legacyCustomer,
  legacyDesigner,
  legacyDesignActivity,
} from '../../../db/schema-legacy';
import { eq, desc, ilike, or, and, sql, asc } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[designs API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const status = searchParams.get('status') ?? '';
  const sortDir = searchParams.get('sortDir') ?? 'desc';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();
    const conditions = [];

    if (branchId) conditions.push(eq(legacyDesign.branchId, branchId));

    if (status && status !== 'all') {
      conditions.push(eq(legacyDesign.status, status));
    } else if (!status) {
      conditions.push(eq(legacyDesign.status, 'Active'));
    }

    if (q) {
      conditions.push(
        or(
          ilike(legacyDesign.planName, `%${q}%`),
          ilike(legacyDesign.planNumber, `%${q}%`),
          sql`exists (select 1 from customer c where c.id = ${legacyDesign.customerId} and c.name ilike ${`%${q}%`})`
        )
      );
    }

    const orderFn = sortDir === 'asc' ? asc : desc;

    const rows = await db
      .select({
        id: legacyDesign.id,
        planNumber: legacyDesign.planNumber,
        planName: legacyDesign.planName,
        projectAddress: legacyDesign.projectAddress,
        contractor: legacyDesign.contractor,
        status: legacyDesign.status,
        logDate: legacyDesign.logDate,
        preliminarySetDate: legacyDesign.preliminarySetDate,
        squareFootage: legacyDesign.squareFootage,
        notes: legacyDesign.notes,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
        designerName: legacyDesigner.name,
      })
      .from(legacyDesign)
      .leftJoin(legacyCustomer, eq(legacyDesign.customerId, legacyCustomer.id))
      .leftJoin(legacyDesigner, eq(legacyDesign.designerId, legacyDesigner.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(legacyDesign.logDate))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyDesign)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({ designs: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    return dbError(err);
  }
}

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

  const planName = body.planName as string;
  const customerId = body.customerId as number;
  const projectAddress = body.projectAddress as string;

  if (!planName || !customerId || !projectAddress) {
    return NextResponse.json(
      { error: 'planName, customerId, and projectAddress are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    // Auto-generate plan number: D-YYMM-NNN
    const now = new Date();
    const prefix = `D-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyDesign)
      .where(ilike(legacyDesign.planNumber, `${prefix}%`));
    const planNumber = `${prefix}-${String((countResult?.count ?? 0) + 1).padStart(3, '0')}`;

    const [design] = await db
      .insert(legacyDesign)
      .values({
        planNumber,
        planName,
        customerId,
        projectAddress,
        contractor: (body.contractor as string) ?? null,
        designerId: body.designerId as number | undefined,
        status: 'Active',
        planDescription: (body.planDescription as string) ?? null,
        squareFootage: body.squareFootage as number | undefined,
        notes: (body.notes as string) ?? null,
        branchId: branchId ?? (body.branchId as number | undefined),
        jobId: body.jobId as number | undefined,
      })
      .returning();

    // Log activity
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyDesignActivity).values({
        userId,
        designId: design.id,
        action: 'created',
      });
    }

    return NextResponse.json({ design }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
