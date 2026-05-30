// POST /api/admin/hubbell/cust-po-backfill
//
// Bulk-backfill the Hubbell PO/WO doc# into Agility SO's customer-PO field
// (agility_so_header.po_number) for SOs that we've already linked to Hubbell
// docs via bids.hubbell_document_sos.
//
// Behavior mirrors the existing per-attach writeback in
// /api/admin/hubbell/documents/[id]/attach: append-not-replace semantics
// (parse existing po_number into tokens, add the new doc_number if not
// already present, comma-join). The same HUBBELL_AGILITY_WRITEBACK_MODE
// env var controls test vs prod target.
//
// This endpoint lets the PC test agent (and later, bulk-run scripts) push
// the full back-catalog of 935+ confirmed (so_id, doc_number) pairs without
// individually attaching each one through the UI.
//
// Auth: Bearer $HUBBELL_UPLOAD_TOKEN.
// Body:
//   {
//     "entries":  [{ "so_id": number, "doc_number": string }, ...],  // required
//     "policy":   "append" | "skip_non_empty",                       // default 'append'
//     "dry_run":  boolean                                            // default false
//   }
//
// `entries` can carry up to 100 pairs per call. The PC script paginates.
//
// `policy`:
//   - 'append' (default, mirrors attach route): if existing po_number has a
//     value, parse + dedupe + comma-append the new doc_number. Existing
//     non-Hubbell strings like '303871MG' are preserved.
//   - 'skip_non_empty': if po_number is already non-empty, skip and report
//     the existing value. Use for conservative back-fills that don't want to
//     touch any field with prior data.
//
// `dry_run` skips the actual Agility API call but still does the lookup,
// parse, decision logic, and returns the would-be new_po_number. Useful for
// preview runs before flipping HUBBELL_AGILITY_WRITEBACK_MODE on.
//
// Response: { mode, results: [...], summary: { attempted, written, skipped, errored } }

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { getDb } from '../../../../../db/index';
import { agilityApi, AgilityApiError } from '../../../../../src/lib/agility-api';
import { parsePoNumberField, normalizeDocNumber } from '../../../../../src/lib/hubbell/po-number-parser';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_ENTRIES = 100;

interface Entry {
  so_id: number;
  doc_number: string;
}

type ResultStatus =
  | 'written'                   // Agility API returned ReturnCode=0
  | 'already_present'           // doc# already in po_number; idempotent
  | 'skipped_non_empty'         // policy=skip_non_empty and po_number had a value
  | 'skipped_no_mirror'         // SO not in agility_so_header mirror yet
  | 'skipped_dry_run'           // dry_run mode (would have written)
  | 'skipped_mode_disabled'     // HUBBELL_AGILITY_WRITEBACK_MODE not set
  | 'error';

interface Result {
  so_id: number;
  doc_number: string;
  status: ResultStatus;
  current_po?: string | null;
  new_po?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: { entries?: unknown; policy?: unknown; dry_run?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: 'entries[] is required and non-empty' }, { status: 400 });
  }
  if (body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `entries[] capped at ${MAX_ENTRIES} per call — paginate` }, { status: 400 });
  }

  const entries: Entry[] = [];
  for (const raw of body.entries as unknown[]) {
    const e = raw as { so_id?: unknown; doc_number?: unknown };
    const soId = Number(e.so_id);
    const docNumber = typeof e.doc_number === 'string' ? e.doc_number.trim() : '';
    if (!Number.isFinite(soId) || !docNumber) {
      return NextResponse.json({ error: `invalid entry: ${JSON.stringify(raw)}` }, { status: 400 });
    }
    entries.push({ so_id: soId, doc_number: docNumber });
  }

  const policy: 'append' | 'skip_non_empty' = body.policy === 'skip_non_empty' ? 'skip_non_empty' : 'append';
  const dryRun = body.dry_run === true;

  const mode = (process.env.HUBBELL_AGILITY_WRITEBACK_MODE ?? '').toLowerCase();
  const writebackEnabled = mode === 'test' || mode === 'prod';

  const db = getDb();
  const results: Result[] = [];

  // Pre-fetch current po_number for all so_ids in one query
  const soIds = Array.from(new Set(entries.map((e) => e.so_id))).map(String);
  type Row = { so_id: string; po_number: string | null };
  const rawRows = await db.execute(dsql`
    SELECT soh.so_id::text AS so_id, soh.po_number
    FROM public.agility_so_header soh
    WHERE soh.is_deleted = false AND soh.so_id IN (${dsql.join(soIds.map((s) => dsql`${s}`), dsql`, `)})
  `);
  const rows: Row[] = Array.isArray(rawRows) ? (rawRows as unknown as Row[]) : ((rawRows as { rows?: Row[] }).rows ?? []);
  const currentByid = new Map<number, string | null>();
  for (const r of rows) currentByid.set(Number(r.so_id), r.po_number);

  for (const entry of entries) {
    const { so_id: soId, doc_number: docNumber } = entry;
    if (!currentByid.has(soId)) {
      results.push({ so_id: soId, doc_number: docNumber, status: 'skipped_no_mirror' });
      continue;
    }

    const currentPo = currentByid.get(soId) ?? null;
    const existingTokens = parsePoNumberField(currentPo);
    const normalizedDoc = normalizeDocNumber(docNumber);
    const alreadyPresent = existingTokens.some((t) => normalizeDocNumber(t) === normalizedDoc);

    if (alreadyPresent) {
      results.push({
        so_id: soId,
        doc_number: docNumber,
        status: 'already_present',
        current_po: currentPo,
        new_po: currentPo ?? '',
      });
      await markPostedToAgility(db, soId, docNumber);
      continue;
    }

    if (policy === 'skip_non_empty' && existingTokens.length > 0) {
      results.push({
        so_id: soId,
        doc_number: docNumber,
        status: 'skipped_non_empty',
        current_po: currentPo,
      });
      continue;
    }

    const newPo = existingTokens.length > 0
      ? `${existingTokens.join(',')},${docNumber.toUpperCase()}`
      : docNumber.toUpperCase();

    if (!writebackEnabled) {
      results.push({
        so_id: soId,
        doc_number: docNumber,
        status: 'skipped_mode_disabled',
        current_po: currentPo,
        new_po: newPo,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        so_id: soId,
        doc_number: docNumber,
        status: 'skipped_dry_run',
        current_po: currentPo,
        new_po: newPo,
      });
      continue;
    }

    try {
      const res = await agilityApi.salesOrderHeaderUpdate(soId, newPo, {
        useTest: mode === 'test',
      });
      if (res.ReturnCode === 0) {
        results.push({
          so_id: soId,
          doc_number: docNumber,
          status: 'written',
          current_po: currentPo,
          new_po: newPo,
        });
        // Update the local mirror so a subsequent entry on the same SO sees
        // the new po_number value (avoids re-writing the same content if
        // multiple docs map to the same SO).
        currentByid.set(soId, newPo);
        await markPostedToAgility(db, soId, docNumber);
      } else {
        results.push({
          so_id: soId,
          doc_number: docNumber,
          status: 'error',
          current_po: currentPo,
          new_po: newPo,
          error: `RC ${res.ReturnCode}: ${res.MessageText || '(no message)'}`,
        });
      }
    } catch (err) {
      const msg = err instanceof AgilityApiError
        ? `${err.message} (RC ${err.returnCode})`
        : err instanceof Error
          ? err.message
          : String(err);
      results.push({
        so_id: soId,
        doc_number: docNumber,
        status: 'error',
        current_po: currentPo,
        new_po: newPo,
        error: msg,
      });
    }
  }

  const summary = {
    attempted: results.length,
    written: results.filter((r) => r.status === 'written').length,
    already_present: results.filter((r) => r.status === 'already_present').length,
    skipped_non_empty: results.filter((r) => r.status === 'skipped_non_empty').length,
    skipped_no_mirror: results.filter((r) => r.status === 'skipped_no_mirror').length,
    skipped_dry_run: results.filter((r) => r.status === 'skipped_dry_run').length,
    skipped_mode_disabled: results.filter((r) => r.status === 'skipped_mode_disabled').length,
    errored: results.filter((r) => r.status === 'error').length,
  };

  return NextResponse.json({
    mode: writebackEnabled ? mode : 'disabled',
    policy,
    dry_run: dryRun,
    summary,
    results,
  });
}

// Mark hubbell_document_sos.posted_to_agility_at so we don't re-process the
// pair on subsequent batches. Looks up the document_id by doc_number since
// the entry doesn't carry it directly.
async function markPostedToAgility(
  db: ReturnType<typeof getDb>,
  soId: number,
  docNumber: string,
): Promise<void> {
  try {
    await db.execute(dsql`
      UPDATE bids.hubbell_document_sos
      SET posted_to_agility_at = NOW()
      WHERE so_id = ${soId}
        AND document_id IN (
          SELECT id FROM bids.hubbell_documents
          WHERE doc_number = ${docNumber}
        )
    `);
  } catch {
    // Best-effort. A failure here doesn't undo the Agility write.
  }
}
