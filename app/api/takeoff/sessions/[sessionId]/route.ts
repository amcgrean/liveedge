import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
import { legacyBid, legacyBidFile } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions/[sessionId] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]  – full session with related data
// ──────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  try {
    const db = getDb();

    const [takeoffSession] = await db
      .select()
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!takeoffSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const [viewports, groups, measurements, pageStates] = await Promise.all([
      db
        .select()
        .from(schema.takeoffViewports)
        .where(eq(schema.takeoffViewports.sessionId, sessionId)),
      db
        .select()
        .from(schema.takeoffGroups)
        .where(eq(schema.takeoffGroups.sessionId, sessionId)),
      db
        .select()
        .from(schema.takeoffMeasurements)
        .where(eq(schema.takeoffMeasurements.sessionId, sessionId)),
      db
        .select()
        .from(schema.takeoffPageStates)
        .where(eq(schema.takeoffPageStates.sessionId, sessionId)),
    ]);

    return NextResponse.json({
      session: takeoffSession,
      viewports,
      groups,
      measurements,
      pageStates,
    });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// PUT /api/takeoff/sessions/[sessionId]  – update session name or metadata
// ──────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  let body: {
    name?: string;
    pdfFileName?: string;
    pdfStorageKey?: string;
    pageCount?: number;
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
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const updateData: Partial<typeof schema.takeoffSessions.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.pdfFileName !== undefined) updateData.pdfFileName = body.pdfFileName;
    if (body.pdfStorageKey !== undefined) updateData.pdfStorageKey = body.pdfStorageKey;
    if (body.pageCount !== undefined) updateData.pageCount = body.pageCount;

    const [updated] = await db
      .update(schema.takeoffSessions)
      .set(updateData)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .returning();

    // Write-back: if PDF changed and session is linked to a legacy bid,
    // upsert the file record and update the bid's planFilename.
    if (body.pdfStorageKey !== undefined && updated.legacyBidId) {
      const newKey  = body.pdfStorageKey;
      const newName = body.pdfFileName ?? updated.pdfFileName ?? '';

      if (newKey) {
        // Upsert legacyBidFile so the file appears in the bid's attachment list
        const existing = await db
          .select({ id: legacyBidFile.id })
          .from(legacyBidFile)
          .where(eq(legacyBidFile.fileKey, newKey))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(legacyBidFile).values({
            bidId:    updated.legacyBidId,
            fileKey:  newKey,
            filename: newName,
            fileType: 'application/pdf',
          });
        }
      }

      // Keep legacyBid.planFilename in sync with the takeoff's active PDF
      await db
        .update(legacyBid)
        .set({ planFilename: newName })
        .where(eq(legacyBid.id, updated.legacyBidId));
    }

    return NextResponse.json({ session: updated });
  } catch (err) {
    return dbError(err);
  }
}

// ──────────────────────────────────────────────────────────
// DELETE /api/takeoff/sessions/[sessionId]  – delete session (cascade)
// ──────────────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  try {
    const db = getDb();

    const [existing] = await db
      .select()
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await db
      .delete(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId));

    return NextResponse.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
