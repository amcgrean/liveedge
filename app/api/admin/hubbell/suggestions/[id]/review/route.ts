// POST /api/admin/hubbell/suggestions/[id]/review
//
// Accept or reject a suggested Hubbell-doc → Agility-SO match.
//
// Auth: user session with `hubbell.review` capability.
//
// Body: { action: 'accept' | 'reject' }
//
// Behavior:
//   - accept: inside a transaction, mark the suggestion 'accepted', insert a
//     hubbell_document_sos row (or skip if one already exists for this pair),
//     and bump hubbell_documents.match_status to 'confirmed' if it was lower.
//   - reject: mark suggestion 'rejected'. No write to hubbell_document_sos.
//
// Idempotent — re-running with the same action on an already-reviewed
// suggestion returns the existing status (no double-attach).

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { verifyHubbellUploadToken } from '../../../../../../../src/lib/service-auth';
import { getDb, schema } from '../../../../../../../db/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = { action?: unknown };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Dual auth: bearer for local review CLI, user session for UI.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  let reviewer: string;
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
    // Reviewer identity: caller may pass X-Reviewer header (e.g. "codex" / "claude-code")
    reviewer = req.headers.get('x-reviewer') || 'service:hubbell-review-cli';
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
    reviewer = auth.user?.name ?? auth.user?.email ?? 'unknown';
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

  const db = getDb();

  return await db.transaction(async (tx) => {
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
      return NextResponse.json({ error: 'suggestion not found' }, { status: 404 });
    }
    const s = found[0];

    if (s.status === action || s.status === `${action}ed`) {
      // Already in this terminal state — no-op
      return NextResponse.json({ status: s.status, no_op: true });
    }
    if (s.status === 'accepted' || s.status === 'rejected') {
      // Trying to flip a terminal state. Refuse — would require a separate
      // "undo" endpoint to keep audit clean.
      return NextResponse.json(
        { error: `suggestion already ${s.status}` },
        { status: 409 },
      );
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
      return NextResponse.json({ status: 'rejected' });
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

    return NextResponse.json({
      status: 'accepted',
      attached_so_id: s.soId,
    });
  });
}
