// POST /api/admin/hubbell/documents/[id]/reject — marks the document rejected.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../../db/index';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const db = getDb();
  await db
    .update(schema.hubbellDocuments)
    .set({ matchStatus: 'rejected', updatedAt: new Date() })
    .where(eq(schema.hubbellDocuments.id, id));
  return NextResponse.json({ ok: true });
}
