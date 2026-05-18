// GET /api/admin/hubbell/documents
// Paginated list of Hubbell documents with filters and status counts.
//
// Query params:
//   tab    — 'unmatched' | 'auto_matched' | 'confirmed' | 'rejected' | 'all' (default 'unmatched')
//   type   — 'po' | 'wo' | '' (default '')
//   q      — search across doc_number, attached cust_code, extracted_address
//   page   — 1-based
//   limit  — default 50

import { NextRequest, NextResponse } from 'next/server';
import { sql as dsql, and, eq, desc } from 'drizzle-orm';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb, schema } from '../../../../../db/index';

export const runtime = 'nodejs';

const TABS = ['unmatched', 'auto_matched', 'confirmed', 'rejected', 'all'] as const;
type Tab = (typeof TABS)[number];

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('hubbell.review');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const rawTab = (searchParams.get('tab') ?? 'unmatched') as Tab;
  const tab: Tab = TABS.includes(rawTab) ? rawTab : 'unmatched';
  const type = searchParams.get('type') ?? '';
  const q = (searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));
  const offset = (page - 1) * limit;

  const db = getDb();

  const statusFilter = tab !== 'all'
    ? eq(schema.hubbellDocuments.matchStatus, tab)
    : undefined;
  const typeFilter = type === 'po' || type === 'wo'
    ? eq(schema.hubbellDocuments.docType, type)
    : undefined;

  // Search hits doc_number, extracted_address, OR any attached cust_code.
  const searchFilter = q
    ? dsql`(
        ${schema.hubbellDocuments.docNumber} ILIKE ${'%' + q + '%'}
        OR COALESCE(${schema.hubbellDocuments.extractedAddress}, '') ILIKE ${'%' + q + '%'}
        OR EXISTS (
          SELECT 1 FROM bids.hubbell_document_sos j
          WHERE j.document_id = ${schema.hubbellDocuments.id}
            AND (j.cust_code ILIKE ${'%' + q + '%'} OR j.so_id::text ILIKE ${'%' + q + '%'})
        )
      )`
    : undefined;

  const where = and(...[statusFilter, typeFilter, searchFilter].filter(Boolean));

  const rows = await db
    .select({
      id: schema.hubbellDocuments.id,
      docType: schema.hubbellDocuments.docType,
      docNumber: schema.hubbellDocuments.docNumber,
      matchStatus: schema.hubbellDocuments.matchStatus,
      extractedAddress: schema.hubbellDocuments.extractedAddress,
      extractedCity: schema.hubbellDocuments.extractedCity,
      extractedState: schema.hubbellDocuments.extractedState,
      extractedZip: schema.hubbellDocuments.extractedZip,
      extractedTotal: schema.hubbellDocuments.extractedTotal,
      receivedAt: schema.hubbellDocuments.receivedAt,
      attachedCount: dsql<number>`(
        SELECT COUNT(*)::int FROM bids.hubbell_document_sos j
        WHERE j.document_id = ${schema.hubbellDocuments.id}
      )`,
    })
    .from(schema.hubbellDocuments)
    .where(where)
    .orderBy(desc(schema.hubbellDocuments.receivedAt))
    .limit(limit)
    .offset(offset);

  const totalRow = await db
    .select({ total: dsql<number>`COUNT(*)::int` })
    .from(schema.hubbellDocuments)
    .where(where);
  const total = totalRow[0]?.total ?? 0;

  // Status counts (always over all types/searches removed — just per status, ignoring q for tab accuracy).
  const statusCounts = await db
    .select({
      matchStatus: schema.hubbellDocuments.matchStatus,
      count: dsql<number>`COUNT(*)::int`,
    })
    .from(schema.hubbellDocuments)
    .groupBy(schema.hubbellDocuments.matchStatus);

  const counts: Record<string, number> = {
    unmatched: 0,
    auto_matched: 0,
    confirmed: 0,
    rejected: 0,
  };
  for (const r of statusCounts) counts[r.matchStatus] = r.count;

  return NextResponse.json({
    documents: rows,
    total,
    page,
    limit,
    counts,
  });
}
