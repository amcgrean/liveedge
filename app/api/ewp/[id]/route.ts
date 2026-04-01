import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyEWP, legacyCustomer, legacyGeneralAudit } from '../../../../db/schema-legacy';
import { eq, and, sql } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const ewpId = parseInt(id, 10);
  if (isNaN(ewpId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const rows = await db
      .select({ ewp: legacyEWP, customerName: legacyCustomer.name, customerCode: legacyCustomer.customerCode })
      .from(legacyEWP)
      .leftJoin(legacyCustomer, eq(legacyEWP.customerId, legacyCustomer.id))
      .where(eq(legacyEWP.id, ewpId))
      .limit(1);

    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { ewp, customerName, customerCode } = rows[0];

    const activity = await db
      .select()
      .from(legacyGeneralAudit)
      .where(
        and(
          eq(legacyGeneralAudit.modelName, 'ewp'),
          sql`(${legacyGeneralAudit.changes}->>'ewpId')::int = ${ewpId}`
        )
      )
      .orderBy(legacyGeneralAudit.timestamp);

    // Log view
    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyGeneralAudit).values({
        userId,
        modelName: 'ewp',
        action: 'viewed',
        changes: { ewpId },
      });
    }

    return NextResponse.json({ ...ewp, customerName, customerCode, activity });
  } catch (err) {
    console.error('[ewp/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const ewpId = parseInt(id, 10);
  if (isNaN(ewpId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    const allowed = [
      'planNumber', 'customerId', 'address', 'tjiDepth', 'salesRepId',
      'assignedDesigner', 'layoutFinalized', 'agilityQuote', 'importedStellar', 'notes',
    ];
    for (const f of allowed) {
      if (f in body) {
        if (['layoutFinalized', 'agilityQuote', 'importedStellar'].includes(f)) {
          updates[f] = body[f] ? (body[f] as string) : null;
        } else {
          updates[f] = body[f];
        }
      }
    }
    updates.lastUpdatedBy = session.user.name ?? 'Unknown';
    updates.lastUpdatedAt = new Date();

    const [updated] = await db.update(legacyEWP).set(updates).where(eq(legacyEWP.id, ewpId)).returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const userId = parseInt(session.user.id, 10);
    if (!isNaN(userId)) {
      await db.insert(legacyGeneralAudit).values({
        userId,
        modelName: 'ewp',
        action: 'updated',
        changes: { ewpId },
      });
    }

    return NextResponse.json({ ewp: updated });
  } catch (err) {
    console.error('[ewp/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const ewpId = parseInt(id, 10);
  if (isNaN(ewpId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyEWP).where(eq(legacyEWP.id, ewpId)).returning({ id: legacyEWP.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ewp/[id] API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
