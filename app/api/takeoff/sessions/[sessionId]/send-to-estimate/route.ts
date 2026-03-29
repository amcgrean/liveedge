import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb, schema } from '../../../../../../db/index';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions/[sessionId]/send-to-estimate API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: number) {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions/[sessionId]/send-to-estimate
//   Aggregates group totals and writes them to the linked bid's inputs JSONB field
// ──────────────────────────────────────────────────────────
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  try {
    const db = getDb();

    // 1. Load the session to get the linked bidId
    const [takeoffSession] = await db
      .select()
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!takeoffSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!takeoffSession.bidId) {
      return NextResponse.json(
        { error: 'Session is not linked to a bid' },
        { status: 422 }
      );
    }

    // 2. Load all groups with targetField set
    const groups = await db
      .select()
      .from(schema.takeoffGroups)
      .where(eq(schema.takeoffGroups.sessionId, sessionId));

    type TakeoffGroup = typeof schema.takeoffGroups.$inferSelect;
    const groupsWithTarget = groups.filter((g: TakeoffGroup) => g.targetField);

    // 3. For each group, sum all measurement calculatedValues
    const measurements = await db
      .select()
      .from(schema.takeoffMeasurements)
      .where(eq(schema.takeoffMeasurements.sessionId, sessionId));

    const groupTotals = new Map<string, number>();
    for (const g of groupsWithTarget) {
      groupTotals.set(g.id, 0);
    }

    for (const m of measurements) {
      const current = groupTotals.get(m.groupId);
      if (current !== undefined && m.calculatedValue) {
        groupTotals.set(m.groupId, current + parseFloat(m.calculatedValue));
      }
    }

    // 4. Load the bid's current inputs JSONB
    const [bid] = await db
      .select()
      .from(schema.bids)
      .where(eq(schema.bids.id, takeoffSession.bidId))
      .limit(1);

    if (!bid) {
      return NextResponse.json({ error: 'Linked bid not found' }, { status: 404 });
    }

    const inputs = (bid.inputs as Record<string, unknown>) ?? {};

    // 5. For each group, set the value at the targetField path in inputs
    const updatedFields: string[] = [];
    for (const g of groupsWithTarget) {
      const total = groupTotals.get(g.id) ?? 0;
      setNestedValue(inputs, g.targetField!, total);
      updatedFields.push(g.targetField!);
    }

    // 6. Write updated inputs back to bid
    await db
      .update(schema.bids)
      .set({
        inputs,
        updatedAt: new Date(),
      })
      .where(eq(schema.bids.id, takeoffSession.bidId));

    return NextResponse.json({ success: true, updatedFields });
  } catch (err) {
    return dbError(err);
  }
}
