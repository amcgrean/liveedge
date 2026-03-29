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
  console.error('[takeoff/sessions/[sessionId]/viewports API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]/viewports  – list viewports
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

  try {
    const db = getDb();

    const conditions = [eq(schema.takeoffViewports.sessionId, sessionId)];
    if (page) {
      conditions.push(eq(schema.takeoffViewports.pageNumber, parseInt(page, 10)));
    }

    const viewports = await db
      .select()
      .from(schema.takeoffViewports)
      .where(and(...conditions));

    return NextResponse.json({ viewports });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions/[sessionId]/viewports  – create/upsert viewport
// ──────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  let body: {
    id?: string;
    pageNumber: number;
    name: string;
    bounds?: unknown;
    pixelsPerUnit?: string;
    unit?: string;
    scaleName?: string;
    scalePreset?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || body.pageNumber === undefined) {
    return NextResponse.json(
      { error: 'name and pageNumber are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    // If id provided, update existing viewport
    if (body.id) {
      const [updated] = await db
        .update(schema.takeoffViewports)
        .set({
          pageNumber: body.pageNumber,
          name: body.name,
          bounds: body.bounds as Record<string, unknown>,
          pixelsPerUnit: body.pixelsPerUnit ?? null,
          unit: body.unit ?? 'ft',
          scaleName: body.scaleName ?? null,
          scalePreset: body.scalePreset ?? null,
        })
        .where(eq(schema.takeoffViewports.id, body.id))
        .returning();

      return NextResponse.json({ viewport: updated });
    }

    // Otherwise create new
    const [viewport] = await db
      .insert(schema.takeoffViewports)
      .values({
        sessionId,
        pageNumber: body.pageNumber,
        name: body.name,
        bounds: body.bounds as Record<string, unknown>,
        pixelsPerUnit: body.pixelsPerUnit ?? null,
        unit: body.unit ?? 'ft',
        scaleName: body.scaleName ?? null,
        scalePreset: body.scalePreset ?? null,
      })
      .returning();

    return NextResponse.json({ viewport }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/takeoff/sessions/[sessionId]/viewports?id=
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
      .delete(schema.takeoffViewports)
      .where(eq(schema.takeoffViewports.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
