import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq, desc } from 'drizzle-orm';
import { STANDARD_PRESETS } from '@/lib/takeoff/presets';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions  – list sessions, optional ?bidId= filter
// ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const bidId = searchParams.get('bidId');

  try {
    const db = getDb();

    const query = db
      .select()
      .from(schema.takeoffSessions)
      .orderBy(desc(schema.takeoffSessions.updatedAt));

    const rows = bidId
      ? await query.where(eq(schema.takeoffSessions.bidId, bidId))
      : await query;

    return NextResponse.json({ sessions: rows });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions  – create new session with preset groups
// ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    bidId?: string;
    name: string;
    pdfFileName: string;
    pageCount: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.pdfFileName) {
    return NextResponse.json(
      { error: 'name and pdfFileName are required' },
      { status: 422 }
    );
  }

  try {
    const db = getDb();

    const [takeoffSession] = await db
      .insert(schema.takeoffSessions)
      .values({
        bidId: body.bidId ?? null,
        name: body.name,
        pdfFileName: body.pdfFileName,
        pageCount: body.pageCount ?? 0,
        createdBy: session.user?.id ?? null,
      })
      .returning();

    // Create standard preset groups
    if (STANDARD_PRESETS.length > 0) {
      await db.insert(schema.takeoffGroups).values(
        STANDARD_PRESETS.map((preset, idx) => ({
          sessionId: takeoffSession.id,
          name: preset.name,
          color: preset.color,
          type: preset.toolType,
          unit: preset.unit,
          sortOrder: idx,
          targetField: preset.targetField,
          isPreset: true,
          category: preset.category,
        }))
      );
    }

    return NextResponse.json({ session: takeoffSession }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
