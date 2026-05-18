// POST /api/admin/hubbell/documents/[id]/attach
// Body: { so_id: number, source?: 'manual' | 'address', confidence?: number, reasons?: string[] }
//
// Inserts a junction row (or no-ops on conflict). Bumps the document's
// match_status to 'auto_matched' if this is the first attachment.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../../db/index';
import { getErpSql } from '../../../../../../../db/supabase';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { id } = await params;
  let body: { so_id?: unknown; source?: unknown; confidence?: unknown; reasons?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const soId = typeof body.so_id === 'number' ? body.so_id : Number(body.so_id);
  if (!Number.isFinite(soId)) {
    return NextResponse.json({ error: 'so_id is required' }, { status: 400 });
  }
  // Valid sources for a reviewer-initiated attach. 'manual' is the default
  // when the reviewer typed an SO# by hand; the other two preserve the
  // attribution from the matcher so we can tell later whether the link came
  // from a deterministic local-agent shipto match (address_scrape) or a
  // server-side fuzzy address score (address).
  const validSources = ['manual', 'address', 'address_scrape'] as const;
  type Source = typeof validSources[number];
  const source: Source = validSources.includes(body.source as Source)
    ? (body.source as Source)
    : 'manual';
  const confidence = typeof body.confidence === 'number' ? Math.max(0, Math.min(100, body.confidence)) : 100;
  const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r) => typeof r === 'string') : ['manual_attach'];

  const db = getDb();

  // Confirm document exists.
  const docs = await db
    .select({ id: schema.hubbellDocuments.id, matchStatus: schema.hubbellDocuments.matchStatus })
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.id, id))
    .limit(1);
  if (docs.length === 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Look up cust_code for denormalization.
  let custCode: string | null = null;
  try {
    const sql = getErpSql();
    const rows = await sql<Array<{ cust_code: string | null }>>`
      SELECT TRIM(cust_code) AS cust_code
      FROM agility_so_header
      WHERE so_id = ${soId}
      LIMIT 1
    `;
    custCode = rows[0]?.cust_code?.trim() || null;
  } catch (err) {
    console.error('[hubbell attach] cust_code lookup failed', err);
  }

  await db
    .insert(schema.hubbellDocumentSos)
    .values({
      documentId: id,
      soId,
      custCode,
      matchSource: source,
      confidence,
      matchReasons: reasons as string[],
      confirmedBy: session.user?.name ?? session.user?.email ?? 'unknown',
      confirmedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.hubbellDocumentSos.documentId, schema.hubbellDocumentSos.soId],
      set: {
        matchSource: source,
        confidence,
        matchReasons: reasons as string[],
        confirmedBy: session.user?.name ?? session.user?.email ?? 'unknown',
        confirmedAt: new Date(),
      },
    });

  // Status transitions:
  //   - 'manual': reviewer explicitly entered the SO# → confirmed
  //   - 'address' or 'address_scrape': reviewer clicked a matcher-surfaced
  //     candidate → confirmed (they actively chose it)
  //   For all reviewer-initiated attaches the document is now confirmed,
  //   regardless of which signal surfaced the candidate.
  await db
    .update(schema.hubbellDocuments)
    .set({ matchStatus: 'confirmed', updatedAt: dsql`now()` })
    .where(eq(schema.hubbellDocuments.id, id));

  return NextResponse.json({ ok: true });
}
