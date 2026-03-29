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
  console.error('[takeoff/sessions/[sessionId]/pages API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]/pages?page=N
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

  if (!page) {
    return NextResponse.json({ error: 'page query param is required' }, { status: 400 });
  }

  try {
    const db = getDb();

    const [pageState] = await db
      .select()
      .from(schema.takeoffPageStates)
      .where(
        and(
          eq(schema.takeoffPageStates.sessionId, sessionId),
          eq(schema.takeoffPageStates.pageNumber, parseInt(page, 10))
        )
      )
      .limit(1);

    return NextResponse.json({ pageState: pageState ?? null });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/takeoff/sessions/[sessionId]/pages  – upsert page state
// ──────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  let body: {
    pageNumber: number;
    fabricJson: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.pageNumber === undefined || body.fabricJson === undefined) {
    return NextResponse.json(
      { error: 'pageNumber and fabricJson are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    await db
      .insert(schema.takeoffPageStates)
      .values({
        sessionId,
        pageNumber: body.pageNumber,
        fabricJson: body.fabricJson as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.takeoffPageStates.sessionId,
          schema.takeoffPageStates.pageNumber,
        ],
        set: {
          fabricJson: body.fabricJson as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
