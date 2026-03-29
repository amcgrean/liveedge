import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb, schema } from '../../../../../../db/index';
import { and, eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions/[sessionId]/measurements API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]/measurements
//   optional ?page=N and ?groupId= filters
// ──────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const page = searchParams.get('page');
  const groupId = searchParams.get('groupId');

  try {
    const db = getDb();

    const conditions = [eq(schema.takeoffMeasurements.sessionId, sessionId)];
    if (page) {
      conditions.push(eq(schema.takeoffMeasurements.pageNumber, parseInt(page, 10)));
    }
    if (groupId) {
      conditions.push(eq(schema.takeoffMeasurements.groupId, groupId));
    }

    const measurements = await db
      .select()
      .from(schema.takeoffMeasurements)
      .where(and(...conditions));

    return NextResponse.json({ measurements });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions/[sessionId]/measurements  – create measurement
// ──────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  let body: {
    groupId: string;
    pageNumber: number;
    viewportId?: string;
    type: string;
    geometry: unknown;
    calculatedValue: string;
    unit: string;
    label: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.groupId || body.pageNumber === undefined || !body.type || !body.label) {
    return NextResponse.json(
      { error: 'groupId, pageNumber, type, and label are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    const [measurement] = await db
      .insert(schema.takeoffMeasurements)
      .values({
        sessionId,
        groupId: body.groupId,
        pageNumber: body.pageNumber,
        viewportId: body.viewportId ?? null,
        type: body.type,
        geometry: body.geometry as Record<string, unknown>,
        calculatedValue: body.calculatedValue ?? null,
        unit: body.unit ?? null,
        label: body.label,
        notes: body.notes ?? null,
      })
      .returning();

    return NextResponse.json({ measurement }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/takeoff/sessions/[sessionId]/measurements  – update measurement
// ──────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await params; // consume params

  let body: {
    id: string;
    groupId?: string;
    pageNumber?: number;
    viewportId?: string;
    type?: string;
    geometry?: unknown;
    calculatedValue?: string;
    unit?: string;
    label?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 422 });
  }

  try {
    const db = getDb();

    const updateData: Partial<typeof schema.takeoffMeasurements.$inferInsert> = {};

    if (body.groupId !== undefined) updateData.groupId = body.groupId;
    if (body.pageNumber !== undefined) updateData.pageNumber = body.pageNumber;
    if (body.viewportId !== undefined) updateData.viewportId = body.viewportId;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.geometry !== undefined) updateData.geometry = body.geometry as Record<string, unknown>;
    if (body.calculatedValue !== undefined) updateData.calculatedValue = body.calculatedValue;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.label !== undefined) updateData.label = body.label;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const [updated] = await db
      .update(schema.takeoffMeasurements)
      .set(updateData)
      .where(eq(schema.takeoffMeasurements.id, body.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Measurement not found' }, { status: 404 });
    }

    return NextResponse.json({ measurement: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/takeoff/sessions/[sessionId]/measurements?id=
// ──────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await params; // consume params

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  try {
    const db = getDb();

    await db
      .delete(schema.takeoffMeasurements)
      .where(eq(schema.takeoffMeasurements.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
