import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb, schema } from '../../../../../../db/index';
import { eq } from 'drizzle-orm';
import { uploadPdf } from '@/lib/r2';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions/[sessionId]/upload API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// POST /api/takeoff/sessions/[sessionId]/upload  – upload PDF to R2
// ──────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Verify session exists
    const db = getDb();
    const [session] = await db
      .select()
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Upload to R2
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await uploadPdf(sessionId, file.name, buffer);

    // Update session record
    const [updated] = await db
      .update(schema.takeoffSessions)
      .set({
        pdfFileName: file.name,
        pdfStorageKey: storageKey,
        updatedAt: new Date(),
      })
      .where(eq(schema.takeoffSessions.id, sessionId))
      .returning();

    return NextResponse.json({
      storageKey: updated.pdfStorageKey,
      fileName: updated.pdfFileName,
    });
  } catch (err) {
    return dbError(err);
  }
}
