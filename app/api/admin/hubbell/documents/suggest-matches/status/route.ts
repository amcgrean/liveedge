// GET /api/admin/hubbell/documents/suggest-matches/status
//
// Lightweight counts endpoint to power the "Run batch" button on the
// /admin/hubbell/suggestions page. Returns how many docs are still candidates
// for the suggester (unmatched + has at least one address signal).
//
// Auth: user session with hubbell.review capability.

import { NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { requireCapability } from '../../../../../../../src/lib/access-control';
import { getDb } from '../../../../../../../db/index';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  const auth = await requireCapability('hubbell.review');
  if (auth instanceof NextResponse) return auth;

  const db = getDb();
  const raw = await db.execute(dsql`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = d.id
        )
      )::int                                                  AS unmatched_docs,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM bids.hubbell_document_sos s WHERE s.document_id = d.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM bids.hubbell_document_suggestions sg
           WHERE sg.document_id = d.id
        )
      )::int                                                  AS never_suggested
    FROM bids.hubbell_documents d
  `);
  const row = (Array.isArray(raw)
    ? (raw[0] as { unmatched_docs?: number; never_suggested?: number } | undefined)
    : ((raw as { rows?: Array<{ unmatched_docs?: number; never_suggested?: number }> }).rows?.[0])
  );

  return NextResponse.json({
    unmatched_docs: Number(row?.unmatched_docs ?? 0),
    never_suggested: Number(row?.never_suggested ?? 0),
  });
}
