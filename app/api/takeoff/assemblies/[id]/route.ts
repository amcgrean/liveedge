import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/assemblies/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/assemblies/[id]  – get single assembly with items
// ──────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = getDb();

    const [assembly] = await db
      .select()
      .from(schema.assemblies)
      .where(eq(schema.assemblies.id, id))
      .limit(1);

    if (!assembly) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }

    const items = await db
      .select()
      .from(schema.assemblyItems)
      .where(eq(schema.assemblyItems.assemblyId, id));

    return NextResponse.json({ assembly: { ...assembly, items } });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/takeoff/assemblies/[id]  – update assembly
// ──────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  let body: {
    name?: string;
    description?: string;
    category?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.assemblies)
      .where(eq(schema.assemblies.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }

    const updateData: Partial<typeof schema.assemblies.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;

    const [updated] = await db
      .update(schema.assemblies)
      .set(updateData)
      .where(eq(schema.assemblies.id, id))
      .returning();

    return NextResponse.json({ assembly: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/takeoff/assemblies/[id]  – soft delete (set isActive=false)
// ──────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.assemblies)
      .where(eq(schema.assemblies.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }

    const [updated] = await db
      .update(schema.assemblies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.assemblies.id, id))
      .returning();

    return NextResponse.json({ success: true, assembly: updated });
  } catch (err) {
    return dbError(err);
  }
}
