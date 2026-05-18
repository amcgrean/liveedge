// GET /api/admin/hubbell/status
// Operational dashboard for the Hubbell ingest pipeline.

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql, desc } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../db/index';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const db = getDb();

  const [latest] = await db
    .select({
      receivedAt: schema.hubbellDocuments.receivedAt,
      sourceRunId: schema.hubbellDocuments.sourceRunId,
    })
    .from(schema.hubbellDocuments)
    .orderBy(desc(schema.hubbellDocuments.receivedAt))
    .limit(1);

  const counts24 = await db
    .select({
      docType: schema.hubbellDocuments.docType,
      count: dsql<number>`COUNT(*)::int`,
    })
    .from(schema.hubbellDocuments)
    .where(dsql`${schema.hubbellDocuments.receivedAt} > now() - interval '24 hours'`)
    .groupBy(schema.hubbellDocuments.docType);

  const statusCounts = await db
    .select({
      matchStatus: schema.hubbellDocuments.matchStatus,
      count: dsql<number>`COUNT(*)::int`,
    })
    .from(schema.hubbellDocuments)
    .groupBy(schema.hubbellDocuments.matchStatus);

  const counts: Record<string, number> = {};
  for (const r of statusCounts) counts[r.matchStatus] = r.count;
  const last24: Record<string, number> = { po: 0, wo: 0 };
  for (const r of counts24) last24[r.docType] = r.count;

  return NextResponse.json({
    last_document_at: latest?.receivedAt ?? null,
    last_source_run_id: latest?.sourceRunId ?? null,
    last_24_hours: last24,
    by_status: counts,
  });
}
