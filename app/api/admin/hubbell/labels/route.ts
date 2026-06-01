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
//     "doc_type": "po" | "wo",          //   server-side)
//     "doc_number": "1612",
//     "ship_to_address_hint": "1618 Garland Ave", // optional — disambiguates
//                                       //   reused doc numbers by matching each
//                                       //   candidate's extracted_address (via
//                                       //   bids.hubbell_normalize_address). If
//                                       //   it matches none, the row errors
//                                       //   rather than guessing.
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
// Response: { ok, failed, warnings, results: [{ index, status, document_id?,
//   so_id?, error?, warning? }] }. A `warning` row still saved but flags a
//   data-quality concern (e.g. the address hint disagreed with the resolved
//   doc, or duplicate docs were collapsed). 422 only when every row failed.
//
// Idempotent — upserts on (document_id, so_id, source).

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, asc, sql as dsql } from 'drizzle-orm';
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
  warning?: string;
};

type ResolveResult = { documentId: string; warning?: string } | { error: string };

// Resolve a label to a single hubbell_documents.id. Handles the doc-number
// reuse problem: when (doc_type, doc_number) maps to multiple historical docs,
// an optional ship_to_address_hint is matched against each candidate's
// extracted_address via bids.hubbell_normalize_address (Dr↔Drive, Cir↔Circle,
// etc.). The hint both *recovers* reused-number docs AND *guards* against bad
// matches: if it agrees with none of the candidate addresses, we refuse rather
// than guess (the doc for that jobsite isn't in our system). When a doc is
// resolved but a provided hint disagrees with its address, we still save but
// flag a warning so the corpus quality issue is visible.
async function resolveDocument(
  db: ReturnType<typeof getDb>,
  opts: { documentId?: string; docType?: string; docNumber?: string; hint?: string | null },
): Promise<ResolveResult> {
  const hint = opts.hint && opts.hint.trim() ? opts.hint.trim() : null;
  const mismatch = (docNorm: string | null, hintNorm: string | null): boolean =>
    !!hintNorm && !!docNorm && docNorm !== hintNorm;

  if (opts.documentId) {
    if (!/^[0-9a-f-]{36}$/i.test(opts.documentId)) return { error: 'document_id must be a uuid' };
    const rows = await db
      .select({
        id: schema.hubbellDocuments.id,
        norm: dsql<string | null>`bids.hubbell_normalize_address(${schema.hubbellDocuments.extractedAddress})`,
        hintNorm: dsql<string>`bids.hubbell_normalize_address(${hint})`,
      })
      .from(schema.hubbellDocuments)
      .where(eq(schema.hubbellDocuments.id, opts.documentId))
      .limit(1);
    if (rows.length === 0) return { error: 'document_id not found' };
    return {
      documentId: rows[0].id,
      warning: mismatch(rows[0].norm, rows[0].hintNorm)
        ? 'ship_to_address_hint disagrees with the document extracted_address'
        : undefined,
    };
  }

  const docType = String(opts.docType ?? '').trim().toLowerCase();
  const docNumber = String(opts.docNumber ?? '').trim();
  if (!docType || !docNumber) return { error: 'supply document_id, or doc_type + doc_number' };

  const rows = await db
    .select({
      id: schema.hubbellDocuments.id,
      address: schema.hubbellDocuments.extractedAddress,
      norm: dsql<string | null>`bids.hubbell_normalize_address(${schema.hubbellDocuments.extractedAddress})`,
      hintNorm: dsql<string>`bids.hubbell_normalize_address(${hint})`,
    })
    .from(schema.hubbellDocuments)
    .where(
      and(
        eq(schema.hubbellDocuments.docType, docType),
        eq(schema.hubbellDocuments.docNumber, docNumber),
      ),
    )
    .orderBy(asc(schema.hubbellDocuments.receivedAt), asc(schema.hubbellDocuments.id));

  if (rows.length === 0) return { error: `no document for ${docType} ${docNumber}` };
  if (rows.length === 1) {
    return {
      documentId: rows[0].id,
      warning: mismatch(rows[0].norm, rows[0].hintNorm)
        ? 'ship_to_address_hint disagrees with the document extracted_address'
        : undefined,
    };
  }

  // ambiguous — need a hint to disambiguate
  if (!hint) {
    return {
      error: `ambiguous (${docType} ${docNumber}) — multiple docs — supply document_id or ship_to_address_hint`,
    };
  }
  const hintNorm = rows[0].hintNorm;
  const matches = rows.filter((r) => r.norm && hintNorm && r.norm === hintNorm);
  if (matches.length === 1) return { documentId: matches[0].id };
  if (matches.length > 1) {
    // genuine duplicate uploads at the same address — collapse to the earliest
    // received (rows are ordered received_at asc, id asc).
    return {
      documentId: matches[0].id,
      warning: `${matches.length} duplicate docs at this address — used earliest received`,
    };
  }
  // hint matched none — refuse rather than poison the corpus
  const addrs = Array.from(new Set(rows.map((r) => r.address).filter(Boolean)));
  return {
    error: `ambiguous (${docType} ${docNumber}) — ship_to_address_hint "${hint}" matched none of: ${addrs.join(' | ')}`,
  };
}

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
  let warnings = 0;

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

      // ── resolve document_id (direct, doc_type+doc_number, or hint-narrowed) ─
      const hint = typeof row.ship_to_address_hint === 'string' ? row.ship_to_address_hint : null;
      const resolved = await resolveDocument(db, {
        documentId: typeof row.document_id === 'string' ? row.document_id.trim() : undefined,
        docType: typeof row.doc_type === 'string' ? row.doc_type : undefined,
        docNumber:
          row.doc_number != null ? String(row.doc_number) : undefined,
        hint,
      });
      if ('error' in resolved) throw new Error(resolved.error);
      const documentId = resolved.documentId;

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

      results.push({
        index: i,
        status: 'ok',
        document_id: documentId,
        so_id: soId,
        warning: resolved.warning,
      });
      ok++;
      if (resolved.warning) warnings++;
    } catch (err) {
      results.push({
        index: i,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return NextResponse.json(
    { ok, failed, warnings, results },
    { status: failed > 0 && ok === 0 ? 422 : 200 },
  );
}
