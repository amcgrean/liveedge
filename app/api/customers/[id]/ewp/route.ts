import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyEWP } from '../../../../../db/schema-legacy';
import { eq, desc } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db
      .select({
        id:               legacyEWP.id,
        planNumber:       legacyEWP.planNumber,
        address:          legacyEWP.address,
        loginDate:        legacyEWP.loginDate,
        tjiDepth:         legacyEWP.tjiDepth,
        assignedDesigner: legacyEWP.assignedDesigner,
        layoutFinalized:  legacyEWP.layoutFinalized,
        agilityQuote:     legacyEWP.agilityQuote,
        importedStellar:  legacyEWP.importedStellar,
        lastUpdatedAt:    legacyEWP.lastUpdatedAt,
      })
      .from(legacyEWP)
      .where(eq(legacyEWP.customerId, custId))
      .orderBy(desc(legacyEWP.loginDate));

    return NextResponse.json({
      ewp: rows.map((r) => ({
        id: r.id,
        planNumber: r.planNumber,
        address: r.address,
        loginDate: r.loginDate ?? null,
        tjiDepth: r.tjiDepth,
        assignedDesigner: r.assignedDesigner ?? null,
        layoutFinalized: r.layoutFinalized ?? null,
        agilityQuote: r.agilityQuote ?? null,
        importedStellar: r.importedStellar ?? null,
        lastUpdatedAt: r.lastUpdatedAt ? r.lastUpdatedAt.toISOString() : null,
        href: `/ewp/${r.id}`,
      })),
    });
  } catch (err) {
    console.error('[customers/[id]/ewp API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
