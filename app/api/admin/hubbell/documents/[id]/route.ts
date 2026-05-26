// GET /api/admin/hubbell/documents/[id]
// Returns document + attached SOs + candidate SOs (matcher re-run live so
// the reviewer sees current Agility state, not stale ingest-time data).

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../db/index';
import { getErpSql } from '../../../../../../db/supabase';
import { matchDocumentToSos } from '../../../../../../src/lib/hubbell/document-matcher';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const db = getDb();

  const docs = await db
    .select()
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.id, id))
    .limit(1);

  if (docs.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const doc = docs[0];

  const attached = await db
    .select()
    .from(schema.hubbellDocumentSos)
    .where(eq(schema.hubbellDocumentSos.documentId, id));

  // Hydrate the attached rows with current SO header data.
  const attachedSoIds = attached.map((a) => a.soId);
  let soHeaders: Record<number, {
    so_id: number;
    cust_name: string | null;
    cust_code: string | null;
    so_status: string | null;
    reference: string | null;
    po_number: string | null;
    shipto_address_1: string | null;
    shipto_city: string | null;
    shipto_state: string | null;
    shipto_zip: string | null;
  }> = {};
  if (attachedSoIds.length > 0) {
    const sql = getErpSql();
    const headers = await sql<Array<{
      so_id: number;
      cust_name: string | null;
      cust_code: string | null;
      so_status: string | null;
      reference: string | null;
      po_number: string | null;
      shipto_address_1: string | null;
      shipto_city: string | null;
      shipto_state: string | null;
      shipto_zip: string | null;
    }>>`
      SELECT
        soh.so_id::int            AS so_id,
        soh.cust_name,
        TRIM(soh.cust_code)       AS cust_code,
        soh.so_status,
        soh.reference,
        soh.po_number,
        soh.shipto_address_1,
        soh.shipto_city,
        soh.shipto_state,
        soh.shipto_zip
      FROM agility_so_header soh
      WHERE soh.so_id = ANY(${attachedSoIds})
    `;
    for (const h of headers) soHeaders[h.so_id] = h;
  }

  // Re-run matcher for fresh candidates (skip the ones already attached).
  let candidates: Awaited<ReturnType<typeof matchDocumentToSos>> = [];
  try {
    const ratioRaw = doc.scrapeMatchRatio;
    const ratioNum =
      ratioRaw !== null && ratioRaw !== undefined && ratioRaw !== ''
        ? Number(ratioRaw)
        : null;
    candidates = await matchDocumentToSos({
      docNumber: doc.docNumber,
      address: {
        address: doc.extractedAddress,
        city: doc.extractedCity,
        state: doc.extractedState,
        zip: doc.extractedZip,
      },
      scrapeHint: {
        custCode: doc.scrapeCustCode,
        seqNum: doc.scrapeSeqNum,
        matchRatio: ratioNum !== null && Number.isFinite(ratioNum) ? ratioNum : null,
      },
    });
  } catch (err) {
    console.error('[hubbell document detail] matcher failed', err);
  }
  const attachedSet = new Set(attachedSoIds);
  const freshCandidates = candidates.filter((c) => !attachedSet.has(c.soId));

  return NextResponse.json({
    document: doc,
    attached_sos: attached.map((a) => ({
      ...a,
      so_header: soHeaders[a.soId] ?? null,
    })),
    candidate_sos: freshCandidates,
  });
}
