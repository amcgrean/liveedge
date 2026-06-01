// POST /api/admin/hubbell/labels
//
// Write training labels for the Hubbell doc → Agility-SO matcher into
// bids.hubbell_match_labels. This is the central corpus both review loops feed:
//   - the cash-application streamlit GUI (via a translator that maps its
//     check → SO decisions to doc → SO labels), and
//   - any future bulk labeling job.
// The scripts/hubbell-review CLI writes its labels through the suggestion-review
// endpoint instead (it already operates on suggestion_ids).
//
// Auth: Bearer HUBBELL_UPLOAD_TOKEN (for local/PC translators) OR a user
// session with `hubbell.review`.
//
// Body (batch or single):
//   { "labels": [ <Label>, ... ] }   or   a single <Label> object
//
// <Label>:
//   {
//     "document_id": "<uuid>",          // OR doc_type + doc_number (resolved
//     "doc_type": "po" | "wo",          //   server-side; must be unambiguous)
//     "doc_number": "1612",
//     "so_id": 16028,                   // required
//     "label": "accept"|"reject"|"skip",// required
//     "source": "cash_app_gui",         // required — which review loop
//     "reason_code": "scope_phase",     // optional
//     "signals": { "address": true, ... }, // optional jsonb
//     "confidence": "high"|"medium"|"low", // optional
//     "reasoning": "verbatim reviewer note", // optional
//     "reviewer": "aaron",              // optional (else X-Reviewer header)
//     "apply_amount": 1234.56,          // optional (cash-app dollars)
//     "suggestion_id": "<uuid>"         // optional provenance link
//   }
//
// Idempotent — upserts on (document_id, so_id, source).

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { verifyHubbellUploadToken } from '../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../db/index';
import {
  upsertMatchLabel,
  VALID_LABEL_ACTIONS,
  VALID_CONFIDENCE,
  type MatchLabelConfidence,
} from '../../../../../src/lib/hubbell/match-labels';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_LABELS = 1000;

type RawLabel = Record<string, unknown>;

type RowResult = {
  index: number;
  status: 'ok' | 'error';
  document_id?: string;
  so_id?: number;
  error?: string;
};

export async function POST(req: NextRequest) {
  // Dual auth: bearer for PC/local translators, session for UI.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  let defaultReviewer: string;
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
    defaultReviewer = req.headers.get('x-reviewer') || 'service:hubbell-labels';
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
    defaultReviewer = auth.user?.name ?? auth.user?.email ?? 'unknown';
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const rawLabels: RawLabel[] = Array.isArray((body as { labels?: unknown })?.labels)
    ? ((body as { labels: RawLabel[] }).labels)
    : body && typeof body === 'object' && !Array.isArray(body)
      ? [body as RawLabel]
      : [];

  if (rawLabels.length === 0) {
    return NextResponse.json({ error: 'no labels provided' }, { status: 400 });
  }
  if (rawLabels.length > MAX_LABELS) {
    return NextResponse.json(
      { error: `too many labels (max ${MAX_LABELS})` },
      { status: 400 },
    );
  }

  const db = getDb();
  const results: RowResult[] = [];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < rawLabels.length; i++) {
    const row = rawLabels[i];
    try {
      // ── validate the simple required fields ──────────────────────────────
      const soIdRaw = row.so_id;
      const soId = typeof soIdRaw === 'number' ? soIdRaw : Number(soIdRaw);
      if (!Number.isInteger(soId)) throw new Error('so_id must be an integer');

      const label = String(row.label ?? '').toLowerCase();
      if (!VALID_LABEL_ACTIONS.has(label)) {
        throw new Error('label must be accept|reject|skip');
      }

      const source = String(row.source ?? '').trim();
      if (!source) throw new Error('source is required');

      const confidenceRaw = row.confidence;
      let confidence: MatchLabelConfidence | null = null;
      if (confidenceRaw != null && String(confidenceRaw).trim() !== '') {
        const c = String(confidenceRaw).toLowerCase();
        if (!VALID_CONFIDENCE.has(c)) throw new Error('confidence must be high|medium|low');
        confidence = c as MatchLabelConfidence;
      }

      // ── resolve document_id (direct, or via doc_type + doc_number) ───────
      let documentId = typeof row.document_id === 'string' ? row.document_id.trim() : '';
      if (!documentId) {
        const docType = String(row.doc_type ?? '').trim().toLowerCase();
        const docNumber = String(row.doc_number ?? '').trim();
        if (!docType || !docNumber) {
          throw new Error('supply document_id, or doc_type + doc_number');
        }
        const matches = await db
          .select({ id: schema.hubbellDocuments.id })
          .from(schema.hubbellDocuments)
          .where(
            and(
              eq(schema.hubbellDocuments.docType, docType),
              eq(schema.hubbellDocuments.docNumber, docNumber),
            ),
          )
          .limit(2);
        if (matches.length === 0) {
          throw new Error(`no document for ${docType} ${docNumber}`);
        }
        if (matches.length > 1) {
          // doc numbers are reused across jobs — refuse to guess.
          throw new Error(
            `ambiguous ${docType} ${docNumber} (multiple docs) — supply document_id`,
          );
        }
        documentId = matches[0].id;
      } else if (!/^[0-9a-f-]{36}$/i.test(documentId)) {
        throw new Error('document_id must be a uuid');
      } else {
        // Confirm the doc exists so the FK upsert doesn't blow up the batch.
        const exists = await db
          .select({ id: schema.hubbellDocuments.id })
          .from(schema.hubbellDocuments)
          .where(eq(schema.hubbellDocuments.id, documentId))
          .limit(1);
        if (exists.length === 0) throw new Error('document_id not found');
      }

      const reviewer =
        (typeof row.reviewer === 'string' && row.reviewer.trim()) || defaultReviewer;
      const suggestionId =
        typeof row.suggestion_id === 'string' && /^[0-9a-f-]{36}$/i.test(row.suggestion_id)
          ? row.suggestion_id
          : null;

      await upsertMatchLabel(db, {
        documentId,
        soId,
        label: label as 'accept' | 'reject' | 'skip',
        source,
        reasonCode:
          typeof row.reason_code === 'string' ? row.reason_code.slice(0, 40) : null,
        signals:
          row.signals != null && typeof row.signals === 'object' ? row.signals : null,
        confidence,
        reasoning: typeof row.reasoning === 'string' ? row.reasoning : null,
        reviewer,
        applyAmount:
          typeof row.apply_amount === 'number' || typeof row.apply_amount === 'string'
            ? (row.apply_amount as number | string)
            : null,
        suggestionId,
      });

      results.push({ index: i, status: 'ok', document_id: documentId, so_id: soId });
      ok++;
    } catch (err) {
      results.push({
        index: i,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return NextResponse.json({ ok, failed, results }, { status: failed > 0 && ok === 0 ? 422 : 200 });
}
