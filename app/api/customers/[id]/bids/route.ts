import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
import { legacyBid, legacyCustomer, legacyEstimator } from '../../../../../db/schema-legacy';
import { eq, desc, and, ilike, or } from 'drizzle-orm';

function dbError(err: unknown) {
  console.error('[customers/[id]/bids API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();

    // Resolve customer
    const [customer] = await db
      .select({ id: legacyCustomer.id, name: legacyCustomer.name, customerCode: legacyCustomer.customerCode })
      .from(legacyCustomer)
      .where(eq(legacyCustomer.id, custId))
      .limit(1);

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    // Legacy bids for this customer
    const legacyRows = await db
      .select({
        id: legacyBid.id,
        projectName: legacyBid.projectName,
        planType: legacyBid.planType,
        status: legacyBid.status,
        logDate: legacyBid.logDate,
        dueDate: legacyBid.dueDate,
        completionDate: legacyBid.completionDate,
        estimatorName: legacyEstimator.estimatorName,
        includeFraming: legacyBid.includeFraming,
        includeSiding: legacyBid.includeSiding,
        includeShingle: legacyBid.includeShingle,
        includeDeck: legacyBid.includeDeck,
        includeTrim: legacyBid.includeTrim,
        includeWindow: legacyBid.includeWindow,
        includeDoor: legacyBid.includeDoor,
      })
      .from(legacyBid)
      .leftJoin(legacyEstimator, eq(legacyBid.estimatorId, legacyEstimator.estimatorID))
      .where(eq(legacyBid.customerId, custId))
      .orderBy(desc(legacyBid.logDate));

    const legacy = legacyRows.map((r) => {
      const specs: string[] = [];
      if (r.includeFraming) specs.push('Framing');
      if (r.includeSiding) specs.push('Siding');
      if (r.includeShingle) specs.push('Shingle');
      if (r.includeDeck) specs.push('Deck');
      if (r.includeTrim) specs.push('Trim');
      if (r.includeWindow) specs.push('Windows');
      if (r.includeDoor) specs.push('Doors');
      return {
        id: `L-${r.id}`,
        source: 'legacy' as const,
        name: r.projectName,
        estimator: r.estimatorName ?? null,
        status: r.status ?? 'Incomplete',
        planType: r.planType ?? null,
        logDate: r.logDate ? r.logDate.toISOString() : null,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        completionDate: r.completionDate ? r.completionDate.toISOString() : null,
        specs,
        href: `/legacy-bids/${r.id}`,
      };
    });

    // Estimator bids matched by customer name (case-insensitive)
    const estRows = await db
      .select({
        id: schema.bids.id,
        jobName: schema.bids.jobName,
        customerName: schema.bids.customerName,
        estimatorName: schema.bids.estimatorName,
        status: schema.bids.status,
        createdAt: schema.bids.createdAt,
        updatedAt: schema.bids.updatedAt,
      })
      .from(schema.bids)
      .where(
        or(
          ilike(schema.bids.customerName, customer.name),
          and(
            ilike(schema.bids.customerName, `%${customer.customerCode}%`)
          )
        )
      )
      .orderBy(desc(schema.bids.updatedAt));

    const estimator = estRows.map((r) => ({
      id: r.id,
      source: 'estimator' as const,
      name: r.jobName,
      estimator: r.estimatorName ?? null,
      status: r.status ?? 'draft',
      planType: null,
      logDate: r.createdAt ? r.createdAt.toISOString() : null,
      dueDate: null,
      completionDate: null,
      specs: [] as string[],
      href: `/?bid=${r.id}`,
    }));

    return NextResponse.json({
      customer: { id: customer.id, name: customer.name, code: customer.customerCode },
      bids: [...legacy, ...estimator],
      counts: { legacy: legacy.length, estimator: estimator.length, total: legacy.length + estimator.length },
    });
  } catch (err) {
    return dbError(err);
  }
}
