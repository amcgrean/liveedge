// GET /api/admin/hubbell/documents/needs-extraction
//
// Lists Hubbell documents that still have empty `line_items` so the
// PC-side backfill agent can re-extract them. Returns a presigned R2 URL
// per row so the agent can download the PDF directly without further
// auth round-trips.
//
// Auth: HUBBELL_UPLOAD_TOKEN bearer (same as /upload + /metadata-bulk).
// Query params:
//   limit  — page size (default 100, max 200)
//   offset — paging offset (default 0)
//   type   — optional 'po' | 'wo' filter
//
// Response:
//   {
//     total: <int>,
//     items: [
//       {
//         id: uuid,
//         doc_type: 'po'|'wo',
//         doc_number: string,
//         received_at: iso,
//         r2_presigned_url: string  // 1h expiry
//       }, ...
//     ]
//   }

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql } from 'drizzle-orm';
import { getDb } from '../../../../../../db/index';
import { verifyHubbellUploadToken } from '../../../../../../src/lib/service-auth';
import { getPresignedUrl } from '../../../../../../src/lib/r2';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_LIMIT = 200;

type Row = {
  id: string;
  doc_type: 'po' | 'wo';
  doc_number: string;
  r2_key: string;
  received_at: string;
};

export async function GET(req: NextRequest) {
  const denied = verifyHubbellUploadToken(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 100;
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const typeFilter = url.searchParams.get('type');
  const docType =
    typeFilter === 'po' || typeFilter === 'wo' ? typeFilter : null;

  const db = getDb();

  // "Needs extraction" = no line items extracted (NULL or empty array).
  // We DON'T also require missing job-context fields, because line items
  // are the user-visible primary signal. If line items extract but
  // job-context doesn't, that's a different (smaller) gap to chase later.
  const where = docType
    ? dsql`(line_items IS NULL OR jsonb_array_length(line_items) = 0) AND doc_type = ${docType}`
    : dsql`(line_items IS NULL OR jsonb_array_length(line_items) = 0)`;

  const totalRows = await db.execute<{ total: string | number }>(
    dsql`SELECT COUNT(*)::int AS total FROM bids.hubbell_documents WHERE ${where}`
  );
  const total = Number((totalRows as unknown as { rows: { total: number }[] }).rows?.[0]?.total ?? 0);

  const rowsResult = await db.execute<Row>(dsql`
    SELECT
      id::text         AS id,
      doc_type,
      doc_number,
      r2_key,
      received_at::text AS received_at
    FROM bids.hubbell_documents
    WHERE ${where}
    ORDER BY received_at DESC, id
    LIMIT ${limit} OFFSET ${offset}
  `);
  const rows = (rowsResult as unknown as { rows: Row[] }).rows ?? [];

  // 1-hour presigned URLs. With limit=200 that's 200 R2 sign calls per
  // request — fast (no network) but still bounded by maxDuration.
  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      doc_type: r.doc_type,
      doc_number: r.doc_number,
      received_at: r.received_at,
      r2_presigned_url: await getPresignedUrl(r.r2_key, 3600),
    }))
  );

  return NextResponse.json({ total, items });
}
