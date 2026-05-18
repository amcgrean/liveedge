// POST /api/admin/hubbell/documents/[id]/detach
// Body: { so_id: number }

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../../db/index';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  let body: { so_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const soId = typeof body.so_id === 'number' ? body.so_id : Number(body.so_id);
  if (!Number.isFinite(soId)) {
    return NextResponse.json({ error: 'so_id is required' }, { status: 400 });
  }

  const db = getDb();
  await db
    .delete(schema.hubbellDocumentSos)
    .where(
      and(
        eq(schema.hubbellDocumentSos.documentId, id),
        eq(schema.hubbellDocumentSos.soId, soId)
      )
    );

  // If no attachments remain, drop the document back to 'unmatched'.
  const remaining = await db
    .select({ id: schema.hubbellDocumentSos.id })
    .from(schema.hubbellDocumentSos)
    .where(eq(schema.hubbellDocumentSos.documentId, id))
    .limit(1);
  if (remaining.length === 0) {
    await db
      .update(schema.hubbellDocuments)
      .set({ matchStatus: 'unmatched', updatedAt: new Date() })
      .where(eq(schema.hubbellDocuments.id, id));
  }

  return NextResponse.json({ ok: true });
}
