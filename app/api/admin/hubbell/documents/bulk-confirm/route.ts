// POST /api/admin/hubbell/documents/bulk-confirm
//
// Flip every supplied doc whose match_status is 'auto_matched' to 'confirmed'.
// Rows in any other state are silently skipped (idempotent — re-running with
// the same payload returns confirmed: 0).
//
// Body: { doc_ids: string[] } (UUIDs)
// Auth: user session with `hubbell.review`.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../db/index';

export const runtime = 'nodejs';
export const maxDuration = 15;

type Body = { doc_ids?: unknown };

export async function POST(req: NextRequest) {
  const auth = await requireCapability('hubbell.review');
  if (auth instanceof NextResponse) return auth;
  const reviewer = auth.user?.name ?? auth.user?.email ?? 'unknown';

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const ids = Array.isArray(body.doc_ids) ? body.doc_ids : [];
  const docIds = ids
    .filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v))
    .slice(0, 500);
  if (docIds.length === 0) {
    return NextResponse.json({ confirmed: 0 });
  }

  const db = getDb();
  const updated = await db
    .update(schema.hubbellDocuments)
    .set({
      matchStatus: 'confirmed',
      updatedAt: dsql`now()`,
    })
    .where(
      and(
        inArray(schema.hubbellDocuments.id, docIds),
        eq(schema.hubbellDocuments.matchStatus, 'auto_matched'),
      ),
    )
    .returning({ id: schema.hubbellDocuments.id });

  // Audit signal via console — the suggestions/review path has a real audit
  // log; the auto-matched docs were already created by the matcher, so a
  // console line is enough.
  if (updated.length > 0) {
    console.log(`[hubbell bulk-confirm] reviewer=${reviewer} confirmed=${updated.length}`);
  }

  return NextResponse.json({ confirmed: updated.length });
}
