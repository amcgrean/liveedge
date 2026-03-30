import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb, schema } from '../../../../../../db/index';
import { eq } from 'drizzle-orm';
import { getPresignedPdfUrl, downloadPdf } from '@/lib/r2';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured. Please set DATABASE_URL.' },
      { status: 503 }
    );
  }
  console.error('[takeoff/sessions/[sessionId]/pdf API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

// ──────────────────────────────────────────────────────────
// GET /api/takeoff/sessions/[sessionId]/pdf  – get PDF (presigned URL or direct)
// ──────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') ?? 'url'; // 'url' or 'download'

  try {
    const db = getDb();
    const [session] = await db
      .select()
      .from(schema.takeoffSessions)
      .where(eq(schema.takeoffSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!session.pdfStorageKey) {
      return NextResponse.json({ error: 'No PDF uploaded for this session' }, { status: 404 });
    }

    if (mode === 'download') {
      // Stream the PDF directly from R2
      const buffer = await downloadPdf(session.pdfStorageKey);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${session.pdfFileName || 'plan.pdf'}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // Default: return presigned URL
    const url = await getPresignedPdfUrl(session.pdfStorageKey);
    return NextResponse.json({ url, fileName: session.pdfFileName });
  } catch (err) {
    return dbError(err);
  }
}
