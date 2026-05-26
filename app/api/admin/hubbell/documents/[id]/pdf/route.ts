// GET /api/admin/hubbell/documents/[id]/pdf
// Returns a 5-minute presigned R2 URL for the document PDF.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { verifyHubbellUploadToken } from '../../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../../db/index';
import { getPresignedUrl } from '../../../../../../../src/lib/r2';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Dual auth: bearer for local review CLI / scripts, user session for UI.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
  } else {
    const authResult = await requireCapability('hubbell.review');
    if (authResult instanceof NextResponse) return authResult;
  }

  const { id } = await params;
  const db = getDb();
  const docs = await db
    .select({ r2Key: schema.hubbellDocuments.r2Key })
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.id, id))
    .limit(1);
  if (docs.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = await getPresignedUrl(docs[0].r2Key, 300);
  return NextResponse.json({ url });
}
