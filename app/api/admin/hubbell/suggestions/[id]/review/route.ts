// POST /api/admin/hubbell/suggestions/[id]/review
//
// Accept or reject a suggested Hubbell-doc → Agility-SO match.
//
// Auth: user session with `hubbell.review`, OR Bearer HUBBELL_UPLOAD_TOKEN
// (used by the scripts/hubbell-review local CLI).
//
// Body: { action: 'accept' | 'reject',
//         reason_code?, signals?, confidence?, reasoning? }
//   The optional rationale fields are persisted to bids.hubbell_match_labels
//   (the matcher training corpus) — source 'cli_review' for bearer callers,
//   'ui_review' for session callers. They do NOT affect the accept/reject
//   itself; they're captured for later keyword-mining + classifier training.
//
// Behavior:
//   - accept: inside a transaction, mark the suggestion 'accepted', insert a
//     hubbell_document_sos row (or skip if one already exists for this pair),
//     and bump hubbell_documents.match_status to 'confirmed' if it was lower.
//   - reject: mark suggestion 'rejected'. No write to hubbell_document_sos.
//   - After the transaction commits, a training label is upserted (best-effort).
//
// Idempotent — re-running with the same action on an already-reviewed
// suggestion returns the existing status (no double-attach), and still
// refreshes the training label.

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { verifyHubbellUploadToken } from '../../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../../db/index';
import {
  upsertMatchLabel,
  VALID_CONFIDENCE,
  type MatchLabelConfidence,
} from '../../../../../../../src/lib/hubbell/match-labels';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  action?: unknown;
  reason_code?: unknown;
  signals?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
};

type TxOutcome =
  | { kind: 'not_found' }
  | { kind: 'conflict'; status: string }
  | { kind: 'noop'; status: string; documentId: string; soId: number }
  | {
      kind: 'done';
      status: 'accepted' | 'rejected';
      documentId: string;
      soId: number;
    };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Dual auth: bearer for local review CLI, user session for UI.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  let reviewer: string;
  let labelSource: string;
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
    // Reviewer identity: caller may pass X-Reviewer header (e.g. "codex" / "claude-code")
    reviewer = req.headers.get('x-reviewer') || 'service:hubbell-review-cli';
    labelSource = 'cli_review';
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
    reviewer = auth.user?.name ?? auth.user?.email ?? 'unknown';
    labelSource = 'ui_review';
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'invalid suggestion id' }, { status: 400 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const action = String(body.action ?? '').toLowerCase();
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be accept|reject' }, { status: 400 });
  }

  // Optional rationale (lenient — bad values are dropped, never 400, so a
  // malformed signals blob can't block a legitimate accept/reject).
  const reasonCode =
    typeof body.reason_code === 'string' ? body.reason_code.slice(0, 40) : null;
  const signals =
    body.signals != null && typeof body.signals === 'object' ? body.signals : null;
  const reasoning = typeof body.reasoning === 'string' ? body.reasoning : null;
  let confidence: MatchLabelConfidence | null = null;
  if (body.confidence != null) {
    const c = String(body.confidence).toLowerCase();
    if (VALID_CONFIDENCE.has(c)) confidence = c as MatchLabelConfidence;
  }

  const db = getDb();

  const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
    const found = await tx
      .select({
        id: schema.hubbellDocumentSuggestions.id,
        documentId: schema.hubbellDocumentSuggestions.documentId,
        soId: schema.hubbellDocumentSuggestions.soId,
        custCode: schema.hubbellDocumentSuggestions.custCode,
        matchSource: schema.hubbellDocumentSuggestions.matchSource,
        confidence: schema.hubbellDocumentSuggestions.confidence,
        matchReasons: schema.hubbellDocumentSuggestions.matchReasons,
        status: schema.hubbellDocumentSuggestions.status,
      })
      .from(schema.hubbellDocumentSuggestions)
      .where(eq(schema.hubbellDocumentSuggestions.id, id))
      .limit(1);

    if (found.length === 0) {
      return { kind: 'not_found' };
    }
    const s = found[0];

    if (s.status === action || s.status === `${action}ed`) {
      // Already in this terminal state — no-op (but still capture the label).
      return { kind: 'noop', status: s.status, documentId: s.documentId, soId: s.soId };
    }
    if (s.status === 'accepted' || s.status === 'rejected') {
      // Trying to flip a terminal state. Refuse — would require a separate
      // "undo" endpoint to keep audit clean.
      return { kind: 'conflict', status: s.status };
    }

    if (action === 'reject') {
      await tx
        .update(schema.hubbellDocumentSuggestions)
        .set({
          status: 'rejected',
          reviewedBy: reviewer,
          reviewedAt: dsql`now()`,
        })
        .where(eq(schema.hubbellDocumentSuggestions.id, id));
      return { kind: 'done', status: 'rejected', documentId: s.documentId, soId: s.soId };
    }

    // accept path: insert into hubbell_document_sos (skip if already there),
    // mark suggestion accepted, bump doc match_status.
    const existing = await tx
      .select({ id: schema.hubbellDocumentSos.id })
      .from(schema.hubbellDocumentSos)
      .where(
        and(
          eq(schema.hubbellDocumentSos.documentId, s.documentId),
          eq(schema.hubbellDocumentSos.soId, s.soId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(schema.hubbellDocumentSos).values({
        documentId: s.documentId,
        soId: s.soId,
        custCode: s.custCode,
        matchSource: s.matchSource,
        confidence: s.confidence,
        matchReasons: s.matchReasons,
        confirmedBy: reviewer,
        confirmedAt: dsql`now()`,
      });
    }

    await tx
      .update(schema.hubbellDocumentSuggestions)
      .set({
        status: 'accepted',
        reviewedBy: reviewer,
        reviewedAt: dsql`now()`,
      })
      .where(eq(schema.hubbellDocumentSuggestions.id, id));

    // If the doc's match_status was 'unmatched' or 'auto_matched', upgrade to
    // 'confirmed' — at least one human has confirmed an attach. Don't downgrade
    // 'rejected' (the doc-level flag for "reviewer rejected the whole doc").
    await tx.execute(dsql`
      UPDATE bids.hubbell_documents
         SET match_status = 'confirmed',
             updated_at   = now()
       WHERE id = ${s.documentId}::uuid
         AND match_status IN ('unmatched','auto_matched')
    `);

    return { kind: 'done', status: 'accepted', documentId: s.documentId, soId: s.soId };
  });

  // Translate the transaction outcome into a response, and persist the training
  // label after the operational write has committed.
  if (outcome.kind === 'not_found') {
    return NextResponse.json({ error: 'suggestion not found' }, { status: 404 });
  }
  if (outcome.kind === 'conflict') {
    return NextResponse.json(
      { error: `suggestion already ${outcome.status}` },
      { status: 409 },
    );
  }

  // best-effort label write — never let it fail the request
  try {
    await upsertMatchLabel(db, {
      documentId: outcome.documentId,
      soId: outcome.soId,
      label: action as 'accept' | 'reject',
      source: labelSource,
      reasonCode,
      signals,
      confidence,
      reasoning,
      reviewer,
      suggestionId: id,
    });
  } catch (err) {
    console.error('[hubbell/review] label upsert failed', err);
  }

  if (outcome.kind === 'noop') {
    return NextResponse.json({ status: outcome.status, no_op: true });
  }
  return NextResponse.json(
    outcome.status === 'accepted'
      ? { status: 'accepted', attached_so_id: outcome.soId }
      : { status: 'rejected' },
  );
}
