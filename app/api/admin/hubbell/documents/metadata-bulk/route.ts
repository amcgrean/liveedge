// POST /api/admin/hubbell/documents/metadata-bulk
//
// Bulk-update extracted metadata on already-uploaded Hubbell documents.
// Use case: the Pi/PC scraper improved its extractor and wants to backfill
// line_items / job context / need_by / etc. for docs that landed before the
// upgrade. We don't accept new PDF bytes here — the document must already
// exist (looked up by `doc_type` + `doc_number`).
//
// Auth: same HUBBELL_UPLOAD_TOKEN bearer as /upload (service token).
// Body (application/json):
//   {
//     items: [
//       {
//         doc_type: 'po' | 'wo',
//         doc_number: string,
//         metadata: { address?, city?, state?, zip?, total?, need_by?,
//                     line_items?, dev_code?, dev_name?, house_number?,
//                     block_lot?, model_elevation?, … }
//       }, ...
//     ]
//   }
//
// Response: { updated, not_found, errors: [{doc_type, doc_number, error}] }
//
// Behavior per item:
//   - Looked up by (doc_type, doc_number).
//   - All provided fields are written (overwriting existing values).
//   - Fields omitted from metadata are NOT touched.
//   - line_items normalized to canonical {sku/desc/qty/uom/unit_price/ext} shape.
//   - We do NOT re-run the matcher here. If the address changed and you want
//     the matcher to re-pick candidates, hit the doc detail page (it re-runs
//     live on open) or call attach manually.
//
// Capped at 500 items per request to stay under the serverless 30s budget.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql as dsql } from 'drizzle-orm';
import { getDb, schema } from '../../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { normalizeDocNumber } from '../../../../../../src/lib/hubbell/po-number-parser';
import { normalizeLineItems, parseNumberToString, parseDateOrNull } from '../../../../../../src/lib/hubbell/metadata-normalize';
import { refreshPaymentRollupForDoc } from '../../../../../../src/lib/hubbell/payment-rollup';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Metadata = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  total?: number | string | null;
  need_by?: string | null;
  line_items?: unknown;
  dev_code?: string | null;
  dev_name?: string | null;
  house_number?: string | null;
  block_lot?: string | null;
  model_elevation?: string | null;
};

type Item = {
  doc_type: 'po' | 'wo';
  doc_number: string;
  metadata: Metadata;
};

const MAX_ITEMS = 500;

export async function POST(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  let body: { items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
  }
  if (body.items.length === 0) {
    return NextResponse.json({ updated: 0, not_found: 0, errors: [] });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Max ${MAX_ITEMS} items per request, got ${body.items.length}` },
      { status: 400 }
    );
  }

  const db = getDb();
  let updated = 0;
  let notFound = 0;
  const errors: { doc_type?: string; doc_number?: string; error: string }[] = [];

  for (const raw of body.items as unknown[]) {
    if (!raw || typeof raw !== 'object') {
      errors.push({ error: 'item must be an object' });
      continue;
    }
    const o = raw as Record<string, unknown>;
    const docType = String(o.doc_type ?? '').toLowerCase().trim();
    const docNumberRaw = String(o.doc_number ?? '').trim();
    if (docType !== 'po' && docType !== 'wo') {
      errors.push({ doc_number: docNumberRaw, error: 'doc_type must be "po" or "wo"' });
      continue;
    }
    if (!docNumberRaw) {
      errors.push({ doc_type: docType, error: 'doc_number is required' });
      continue;
    }
    const docNumber = normalizeDocNumber(docNumberRaw);
    const meta = (o.metadata && typeof o.metadata === 'object' ? o.metadata : {}) as Metadata;

    // Build a partial-update set. Only include keys actually present in the
    // payload (using `in` operator) so we don't clobber existing values with
    // nulls when the scraper omits a field.
    const updates: Record<string, unknown> = {};
    if ('address' in meta) updates.extractedAddress = meta.address ?? null;
    if ('city' in meta) updates.extractedCity = meta.city ?? null;
    if ('state' in meta) updates.extractedState = meta.state ?? null;
    if ('zip' in meta) updates.extractedZip = meta.zip ?? null;
    if ('total' in meta) updates.extractedTotal = parseNumberToString(meta.total);
    if ('need_by' in meta) updates.extractedNeedBy = parseDateOrNull(meta.need_by ?? null);
    if ('line_items' in meta) updates.lineItems = normalizeLineItems(meta.line_items);
    if ('dev_code' in meta) updates.devCode = meta.dev_code ?? null;
    if ('dev_name' in meta) updates.devName = meta.dev_name ?? null;
    if ('house_number' in meta) updates.houseNumber = meta.house_number ?? null;
    if ('block_lot' in meta) updates.blockLot = meta.block_lot ?? null;
    if ('model_elevation' in meta) updates.modelElevation = meta.model_elevation ?? null;

    if (Object.keys(updates).length === 0) {
      errors.push({ doc_type: docType, doc_number: docNumber, error: 'no metadata fields supplied' });
      continue;
    }

    updates.updatedAt = dsql`now()`;

    try {
      const result = await db
        .update(schema.hubbellDocuments)
        .set(updates)
        .where(
          and(
            eq(schema.hubbellDocuments.docType, docType),
            eq(schema.hubbellDocuments.docNumber, docNumber)
          )
        )
        .returning({ id: schema.hubbellDocuments.id });

      if (result.length === 0) {
        notFound++;
      } else {
        updated++;
        // If we just changed extracted_total, payment_status may be stale —
        // recompute it against linked payments. Same logic as /upload's
        // post-insert rollup. Failure is logged but doesn't fail the item.
        if ('extractedTotal' in updates) {
          try {
            await refreshPaymentRollupForDoc(db, result[0].id);
          } catch (err) {
            console.error(
              '[hubbell metadata-bulk] payment rollup refresh failed',
              { doc_type: docType, doc_number: docNumber, err }
            );
          }
        }
      }
    } catch (e) {
      errors.push({
        doc_type: docType,
        doc_number: docNumber,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ updated, not_found: notFound, errors });
}
