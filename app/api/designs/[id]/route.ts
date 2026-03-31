import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import {
  legacyDesign,
  legacyCustomer,
  legacyDesigner,
  legacyDesignActivity,
} from '../../../../db/schema-legacy';
import { eq, asc } from 'drizzle-orm';

function dbError(err: unknown) {
  console.error('[designs/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const designId = parseInt(id, 10);
  if (isNaN(designId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();

    const rows = await db
      .select({
        design: legacyDesign,
        customerName: legacyCustomer.name,
        customerCode: legacyCustomer.customerCode,
        designerName: legacyDesigner.name,
      })
      .from(legacyDesign)
      .leftJoin(legacyCustomer, eq(legacyDesign.customerId, legacyCustomer.id))
      .leftJoin(legacyDesigner, eq(legacyDesign.designerId, legacyDesigner.id))
      .where(eq(legacyDesign.id, designId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { design, customerName, customerCode, designerName } = rows[0];

    const activity = await db
      .select()
      .from(legacyDesignActivity)
      .where(eq(legacyDesignActivity.designId, designId))
      .orderBy(asc(legacyDesignActivity.timestamp));

    // Log view
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyDesignActivity).values({ userId, designId, action: 'viewed' });
    }

    return NextResponse.json({ ...design, customerName, customerCode, designerName, activity });
  } catch (err) {
    return dbError(err);
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const designId = parseInt(id, 10);
  if (isNaN(designId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    const allowed = [
      'planName', 'customerId', 'projectAddress', 'contractor', 'designerId',
      'status', 'planDescription', 'squareFootage', 'notes', 'preliminarySetDate', 'jobId',
    ];
    for (const f of allowed) {
      if (f in body) {
        if (f === 'preliminarySetDate') {
          updates[f] = body[f] ? new Date(body[f] as string) : null;
        } else {
          updates[f] = body[f];
        }
      }
    }
    updates.lastUpdatedBy = session.user.name ?? 'Unknown';
    updates.lastUpdatedAt = new Date();

    const [updated] = await db.update(legacyDesign).set(updates).where(eq(legacyDesign.id, designId)).returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyDesignActivity).values({ userId, designId, action: 'updated' });
    }

    return NextResponse.json({ design: updated });
  } catch (err) {
    return dbError(err);
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const designId = parseInt(id, 10);
  if (isNaN(designId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyDesign).where(eq(legacyDesign.id, designId)).returning({ id: legacyDesign.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
