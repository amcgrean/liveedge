// POST /api/admin/hubbell/jobsites/reconcile
//
// Within-jobsite reconciliation for the historical Hubbell backlog. See
// src/lib/hubbell/jobsite-reconciler.ts for the matching strategy.
//
// Outer loop: jobsite (normalized resolved address). For each jobsite, fetch
// all unmatched docs + all HUBB SOs (any status) at that jobsite, run the
// matcher, persist pairings to hubbell_document_suggestions for review.
//
// Auth: Bearer $HUBBELL_UPLOAD_TOKEN OR user session with hubbell.review.
// Body:
//   {
//     "limit":           20,    // jobsites to process this call (default 20, max 50)
//     "offset":          0,     // pagination through jobsite queue
//     "min_confidence":  30,    // suppress weak pairings (default 30)
//     "norm_addrs":      [...]  // optional: process only these normalized addresses
//   }
// Response: { processed_jobsites, processed_docs, candidates_inserted,
//             candidates_skipped_existing, run_id, errors }

import { NextRequest, NextResponse } from 'next/server';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { requireCapability } from '../../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../../db/index';
import {
  listJobsiteQueue,
  reconcileJobsite,
} from '../../../../../../src/lib/hubbell/jobsite-reconciler';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
  }

  let body: {
    limit?: unknown;
    offset?: unknown;
    min_confidence?: unknown;
    norm_addrs?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(1, Number(body.limit ?? 20) || 20), 50);
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);
  const minConfidence = Math.max(0, Number(body.min_confidence ?? 30) || 0);
  const explicitNorms = Array.isArray(body.norm_addrs)
    ? body.norm_addrs.filter((x): x is string => typeof x === 'string')
    : null;

  const runId = `jobsite_reconcile_${new Date().toISOString().replace(/[:.]/g, '_')}`;

  // Pick the jobsites to process. Either explicit (caller knows what they
  // want) or the queue ordered by descending unmatched doc count.
  const targets =
    explicitNorms && explicitNorms.length > 0
      ? explicitNorms.map((norm_addr) => ({
          norm_addr,
          sample_address: norm_addr,
          doc_count: 0,
          so_count_estimate: 0,
        }))
      : await listJobsiteQueue({ limit, offset });

  const db = getDb();
  let candidatesInserted = 0;
  let candidatesSkippedExisting = 0;
  let processedDocs = 0;
  const errors: Array<{ norm_addr: string; error: string }> = [];

  for (const jobsite of targets) {
    try {
      const { docs, pairings } = await reconcileJobsite(jobsite.norm_addr);
      processedDocs += docs.length;
      const keep = pairings.filter((p) => p.confidence >= minConfidence);
      if (keep.length === 0) continue;

      const result = await db
        .insert(schema.hubbellDocumentSuggestions)
        .values(
          keep.map((p) => ({
            documentId: p.document_id,
            soId: p.so_id,
            custCode: p.cust_code,
            matchSource: p.match_source,
            confidence: p.confidence,
            matchReasons: p.match_reasons,
            sourceRunId: runId,
          })),
        )
        .onConflictDoNothing({
          target: [
            schema.hubbellDocumentSuggestions.documentId,
            schema.hubbellDocumentSuggestions.soId,
          ],
        })
        .returning({ id: schema.hubbellDocumentSuggestions.id });

      candidatesInserted += result.length;
      candidatesSkippedExisting += keep.length - result.length;
    } catch (err) {
      errors.push({
        norm_addr: jobsite.norm_addr,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    run_id: runId,
    processed_jobsites: targets.length,
    processed_docs: processedDocs,
    candidates_inserted: candidatesInserted,
    candidates_skipped_existing: candidatesSkippedExisting,
    errors,
  });
}

export async function GET(req: NextRequest) {
  // Dry-run / queue inspection
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');
  if (hasBearer) {
    const denied = verifyHubbellUploadToken(req);
    if (denied) return denied;
  } else {
    const auth = await requireCapability('hubbell.review');
    if (auth instanceof NextResponse) return auth;
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50), 200);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0') || 0);
  const queue = await listJobsiteQueue({ limit, offset });
  return NextResponse.json({ queue });
}
