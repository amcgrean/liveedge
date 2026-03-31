import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyEWP, legacyCustomer } from '../../../db/schema-legacy';
import { eq, desc, ilike, or, and, sql } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

function dbError(err: unknown) {
  console.error('[ewp API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();
    const conditions = [];

    if (branchId) conditions.push(eq(legacyEWP.branchId, branchId));

    if (q) {
      conditions.push(
        or(
          ilike(legacyEWP.planNumber, `%${q}%`),
          ilike(legacyEWP.address, `%${q}%`),
          sql`exists (select 1 from customer c where c.id = ${legacyEWP.customerId} and c.name ilike ${`%${q}%`})`
        )
      );
    }

    const rows = await db
      .select({
        id: legacyEWP.id,
        planNumber: legacyEWP.planNumber,
        address: legacyEWP.address,
        tjiDepth: legacyEWP.tjiDepth,
        assignedDesigner: legacyEWP.assignedDesigner,
        loginDate: legacyEWP.loginDate,
        layoutFinalized: legacyEWP.layoutFinalized,
        agilityQuote: legacyEWP.agilityQuote,
        importedStellar: legacyEWP.importedStellar,
        notes: legacyEWP.notes,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
      })
      .from(legacyEWP)
      .leftJoin(legacyCustomer, eq(legacyEWP.customerId, legacyCustomer.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(legacyEWP.loginDate))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyEWP)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({ ewps: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const planNumber = body.planNumber as string;
  const customerId = body.customerId as number;
  const address = body.address as string;
  const tjiDepth = body.tjiDepth as string;

  if (!planNumber || !customerId || !address || !tjiDepth) {
    return NextResponse.json({ error: 'planNumber, customerId, address, and tjiDepth are required' }, { status: 422 });
  }

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    const [ewp] = await db
      .insert(legacyEWP)
      .values({
        planNumber,
        customerId,
        address,
        tjiDepth,
        salesRepId: body.salesRepId as number | undefined,
        loginDate: body.loginDate ? new Date(body.loginDate as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        assignedDesigner: (body.assignedDesigner as string) ?? null,
        notes: (body.notes as string) ?? null,
        branchId: branchId ?? (body.branchId as number | undefined),
      })
      .returning();

    return NextResponse.json({ ewp }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
