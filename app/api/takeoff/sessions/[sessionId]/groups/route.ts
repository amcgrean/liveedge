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
  console.error('[takeoff/sessions/[sessionId]/groups API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]/groups  – list groups
// ──────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  try {
    const db = getDb();

    const groups = await db
      .select()
      .from(schema.takeoffGroups)
      .where(eq(schema.takeoffGroups.sessionId, sessionId));

    return NextResponse.json({ groups });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions/[sessionId]/groups  – create group
// ──────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  let body: {
    name: string;
    color: string;
    type: string;
    unit: string;
    targetField?: string;
    isPreset?: boolean;
    category?: string;
    assemblyId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.color || !body.type || !body.unit) {
    return NextResponse.json(
      { error: 'name, color, type, and unit are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    const [group] = await db
      .insert(schema.takeoffGroups)
      .values({
        sessionId,
        name: body.name,
        color: body.color,
        type: body.type,
        unit: body.unit,
        targetField: body.targetField ?? null,
        isPreset: body.isPreset ?? false,
        category: body.category ?? null,
        assemblyId: body.assemblyId ?? null,
      })
      .returning();

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/takeoff/sessions/[sessionId]/groups  – update group
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
    name?: string;
    color?: string;
    type?: string;
    unit?: string;
    sortOrder?: number;
    targetField?: string;
    isPreset?: boolean;
    category?: string;
    assemblyId?: string;
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

    const updateData: Partial<typeof schema.takeoffGroups.$inferInsert> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
    if (body.targetField !== undefined) updateData.targetField = body.targetField;
    if (body.isPreset !== undefined) updateData.isPreset = body.isPreset;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.assemblyId !== undefined) updateData.assemblyId = body.assemblyId;

    const [updated] = await db
      .update(schema.takeoffGroups)
      .set(updateData)
      .where(eq(schema.takeoffGroups.id, body.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    return NextResponse.json({ group: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/takeoff/sessions/[sessionId]/groups?id=
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
      .delete(schema.takeoffGroups)
      .where(eq(schema.takeoffGroups.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
