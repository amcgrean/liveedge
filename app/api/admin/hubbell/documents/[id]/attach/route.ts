// POST /api/admin/hubbell/documents/[id]/attach
// Body: { so_id: number, source?: 'manual' | 'address' | 'address_scrape',
//         confidence?: number, reasons?: string[] }
//
// 1. Inserts/updates a junction row (always succeeds first).
// 2. Updates the document's match_status to 'confirmed'.
// 3. Optionally writes back to Agility: appends the Hubbell doc_number to
//    agility_so_header.po_number via the SalesOrderHeaderUpdate live API,
//    controlled by env var HUBBELL_AGILITY_WRITEBACK_MODE.
//
// The writeback never blocks the junction insert. If Agility is down or
// returns an error, the attach still succeeds and we surface the error in
// the response. The reviewer can retry from the UI; idempotency is handled
// by checking whether the doc_number is already present in po_number before
// re-appending.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../../db/index';
import { getErpSql } from '../../../../../../../db/supabase';
import { agilityApi, AgilityApiError } from '../../../../../../../src/lib/agility-api';
import { parsePoNumberField, normalizeDocNumber } from '../../../../../../../src/lib/hubbell/po-number-parser';

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

  // Look up the SO header — we need cust_code for denormalization AND the
  // current po_number value so we can append (not replace) when writing
  // back to Agility.
  let custCode: string | null = null;
  let currentPoNumber: string | null = null;
  try {
    const sql = getErpSql();
    const rows = await sql<Array<{ cust_code: string | null; po_number: string | null }>>`
      SELECT TRIM(cust_code) AS cust_code, po_number
      FROM agility_so_header
      WHERE so_id = ${soId}
      LIMIT 1
    `;
    custCode = rows[0]?.cust_code?.trim() || null;
    currentPoNumber = rows[0]?.po_number ?? null;
  } catch (err) {
    console.error('[hubbell attach] SO header lookup failed', err);
  }

  // Need the Hubbell doc_number to append to Agility's customer-PO field.
  const docMeta = await db
    .select({ docNumber: schema.hubbellDocuments.docNumber })
    .from(schema.hubbellDocuments)
    .where(eq(schema.hubbellDocuments.id, id))
    .limit(1);
  const docNumber = docMeta[0]?.docNumber ?? null;

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

  // ---- Optional Agility write-back ----
  //
  // Feature-flagged. Modes:
  //   undefined / 'disabled' — skip (default; preserves behavior for users
  //                            who don't have the Agility env vars set)
  //   'test'                 — call AGILITY_API_TEST_URL
  //   'prod'                 — call the production AGILITY_API_URL
  //
  // We never undo the junction insert if Agility fails. The reviewer's
  // confirmation is recorded in LiveEdge regardless of write-back status.
  let agilityWriteback: {
    attempted: boolean;
    skipped_reason?: string;
    mode?: 'test' | 'prod';
    success?: boolean;
    error?: string;
    new_po_number?: string;
  } = { attempted: false };

  const mode = (process.env.HUBBELL_AGILITY_WRITEBACK_MODE ?? '').toLowerCase();
  if (mode === 'test' || mode === 'prod') {
    agilityWriteback = { attempted: true, mode };

    if (!docNumber) {
      agilityWriteback.skipped_reason = 'document not found';
    } else {
      // Append-not-replace: parse existing po_number, add the Hubbell
      // doc_number if not already present, rejoin with commas.
      const existingTokens = parsePoNumberField(currentPoNumber);
      const normalizedDoc = normalizeDocNumber(docNumber);
      const alreadyPresent = existingTokens.some((t) => normalizeDocNumber(t) === normalizedDoc);

      if (alreadyPresent) {
        // Already there — idempotent no-op against Agility. Still record
        // posted_to_agility_at so we don't keep trying on every attach.
        agilityWriteback.success = true;
        agilityWriteback.new_po_number = currentPoNumber ?? '';
        agilityWriteback.skipped_reason = 'doc_number already in po_number';
        await db
          .update(schema.hubbellDocumentSos)
          .set({ postedToAgilityAt: new Date() })
          .where(
            and(
              eq(schema.hubbellDocumentSos.documentId, id),
              eq(schema.hubbellDocumentSos.soId, soId),
            ),
          );
      } else {
        const newPo = existingTokens.length > 0
          ? `${existingTokens.join(',')},${docNumber.toUpperCase()}`
          : docNumber.toUpperCase();
        agilityWriteback.new_po_number = newPo;

        try {
          const res = await agilityApi.salesOrderHeaderUpdate(soId, newPo, {
            useTest: mode === 'test',
          });
          if (res.ReturnCode === 0) {
            agilityWriteback.success = true;
            await db
              .update(schema.hubbellDocumentSos)
              .set({ postedToAgilityAt: new Date() })
              .where(
                and(
                  eq(schema.hubbellDocumentSos.documentId, id),
                  eq(schema.hubbellDocumentSos.soId, soId),
                ),
              );
          } else {
            agilityWriteback.success = false;
            agilityWriteback.error = `RC ${res.ReturnCode}: ${res.MessageText || '(no message)'}`;
            console.warn('[hubbell attach] Agility writeback non-zero RC', res);
          }
        } catch (err) {
          agilityWriteback.success = false;
          agilityWriteback.error =
            err instanceof AgilityApiError
              ? `${err.message} (RC ${err.returnCode})`
              : err instanceof Error
                ? err.message
                : String(err);
          console.error('[hubbell attach] Agility writeback failed', err);
        }
      }
    }
  } else {
    agilityWriteback.skipped_reason = 'HUBBELL_AGILITY_WRITEBACK_MODE not enabled';
  }

  return NextResponse.json({ ok: true, agility_writeback: agilityWriteback });
}
