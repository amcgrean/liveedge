import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyProject, legacyCustomer, legacyUser } from '../../../db/schema-legacy';
import { eq, desc, ilike, or, and, sql } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

function dbError(err: unknown) {
  console.error('[projects API]', err);
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

    if (branchId) conditions.push(eq(legacyProject.branchId, branchId));

    if (q) {
      conditions.push(
        or(
          ilike(legacyProject.contractor, `%${q}%`),
          ilike(legacyProject.projectAddress, `%${q}%`),
          sql`exists (select 1 from customer c where c.id = ${legacyProject.customerId} and c.name ilike ${`%${q}%`})`
        )
      );
    }

    const rows = await db
      .select({
        id: legacyProject.id,
        contractor: legacyProject.contractor,
        projectAddress: legacyProject.projectAddress,
        contractorPhone: legacyProject.contractorPhone,
        contractorEmail: legacyProject.contractorEmail,
        includeFraming: legacyProject.includeFraming,
        includeSiding: legacyProject.includeSiding,
        includeShingles: legacyProject.includeShingles,
        includeDeck: legacyProject.includeDeck,
        includeDoors: legacyProject.includeDoors,
        includeWindows: legacyProject.includeWindows,
        includeTrim: legacyProject.includeTrim,
        notes: legacyProject.notes,
        createdAt: legacyProject.createdAt,
        customerName: legacyCustomer.name,
        salesRepName: legacyUser.username,
      })
      .from(legacyProject)
      .leftJoin(legacyCustomer, eq(legacyProject.customerId, legacyCustomer.id))
      .leftJoin(legacyUser, eq(legacyProject.salesRepId, legacyUser.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(legacyProject.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyProject)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({ projects: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const contractor = body.contractor as string;
  const projectAddress = body.projectAddress as string;

  if (!contractor || !projectAddress) {
    return NextResponse.json({ error: 'contractor and projectAddress are required' }, { status: 422 });
  }

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();
    const userId = parseInt(session.user.id, 10);

    const [project] = await db
      .insert(legacyProject)
      .values({
        contractor,
        projectAddress,
        customerId: body.customerId as number | undefined,
        salesRepId: isNaN(userId) ? 1 : userId,
        contractorPhone: (body.contractorPhone as string) ?? null,
        contractorEmail: (body.contractorEmail as string) ?? null,
        includeFraming: (body.includeFraming as boolean) ?? false,
        includeSiding: (body.includeSiding as boolean) ?? false,
        includeShingles: (body.includeShingles as boolean) ?? false,
        includeDeck: (body.includeDeck as boolean) ?? false,
        includeDoors: (body.includeDoors as boolean) ?? false,
        includeWindows: (body.includeWindows as boolean) ?? false,
        includeTrim: (body.includeTrim as boolean) ?? false,
        notes: (body.notes as string) ?? null,
        branchId: branchId ?? (body.branchId as number | undefined),
      })
      .returning();

    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
