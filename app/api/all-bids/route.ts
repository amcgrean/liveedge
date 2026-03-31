import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb, schema } from '../../../db/index';
import { legacyBid, legacyCustomer, legacyEstimator } from '../../../db/schema-legacy';
import { eq, desc, ilike, or, and, sql } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

export interface UnifiedBid {
  /** Prefixed ID: "L-{int}" for legacy, UUID string for estimator bids */
  id: string;
  source: 'legacy' | 'estimator';
  name: string;
  customer: string | null;
  /** For legacy bids: the integer customer ID (for customer-centric view links) */
  customerId: number | null;
  estimator: string | null;
  status: string;
  planType: string | null;
  logDate: string | null;
  dueDate: string | null;
  branch: string | null;
  /** For legacy bids: list of included spec sections */
  specs: string[];
  /** Destination URL */
  href: string;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const source = searchParams.get('source') ?? 'all'; // all | legacy | estimator
  const status = searchParams.get('status') ?? 'open'; // open | complete | all
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 300);

  const userRole = (session.user as { role?: string }).role ?? 'estimator';

  let legacyRows: UnifiedBid[] = [];
  let estimatorRows: UnifiedBid[] = [];

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    // ── Legacy bids ──────────────────────────────────────
    if (source === 'all' || source === 'legacy') {
      const conditions = [];

      if (branchId) conditions.push(eq(legacyBid.branchId, branchId));

      if (status === 'open') {
        conditions.push(eq(legacyBid.status, 'Incomplete'));
      } else if (status === 'complete') {
        conditions.push(eq(legacyBid.status, 'Complete'));
      }
      // 'all' → no status filter

      if (q) {
        conditions.push(
          or(
            ilike(legacyBid.projectName, `%${q}%`),
            sql`exists (select 1 from customer c where c.id = ${legacyBid.customerId} and c.name ilike ${`%${q}%`})`
          )
        );
      }

      const rows = await db
        .select({
          id: legacyBid.id,
          planType: legacyBid.planType,
          projectName: legacyBid.projectName,
          status: legacyBid.status,
          logDate: legacyBid.logDate,
          dueDate: legacyBid.dueDate,
          includeFraming: legacyBid.includeFraming,
          includeSiding: legacyBid.includeSiding,
          includeShingle: legacyBid.includeShingle,
          includeDeck: legacyBid.includeDeck,
          includeTrim: legacyBid.includeTrim,
          includeWindow: legacyBid.includeWindow,
          includeDoor: legacyBid.includeDoor,
          branchId: legacyBid.branchId,
          customerId: legacyBid.customerId,
          customerName: legacyCustomer.name,
          estimatorName: legacyEstimator.estimatorName,
        })
        .from(legacyBid)
        .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
        .leftJoin(legacyEstimator, eq(legacyBid.estimatorId, legacyEstimator.estimatorID))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(legacyBid.logDate))
        .limit(limit);

      legacyRows = rows.map((r) => {
        const specs: string[] = [];
        if (r.includeFraming) specs.push('Framing');
        if (r.includeSiding) specs.push('Siding');
        if (r.includeShingle) specs.push('Shingle');
        if (r.includeDeck) specs.push('Deck');
        if (r.includeTrim) specs.push('Trim');
        if (r.includeWindow) specs.push('Windows');
        if (r.includeDoor) specs.push('Doors');

        return {
          id: `L-${r.id}`,
          source: 'legacy' as const,
          name: r.projectName,
          customer: r.customerName ?? null,
          customerId: r.customerId ?? null,
          estimator: r.estimatorName ?? null,
          status: r.status ?? 'Incomplete',
          planType: r.planType ?? null,
          logDate: r.logDate ? r.logDate.toISOString() : null,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          branch: r.branchId ? String(r.branchId) : null,
          specs,
          href: `/legacy-bids/${r.id}`,
        };
      });
    }

    // ── Estimator bids (JSONB) ────────────────────────────
    if (source === 'all' || source === 'estimator') {
      const conditions = [];

      // Non-admin sees only their own
      if (userRole !== 'admin') {
        conditions.push(eq(schema.bids.estimatorName, session.user?.name ?? ''));
      }

      if (status === 'open') {
        conditions.push(eq(schema.bids.status, 'draft'));
      } else if (status === 'complete') {
        conditions.push(
          or(eq(schema.bids.status, 'won'), eq(schema.bids.status, 'submitted'))
        );
      }

      if (q) {
        conditions.push(
          or(
            ilike(schema.bids.jobName, `%${q}%`),
            ilike(schema.bids.customerName, `%${q}%`)
          )
        );
      }

      const rows = await db
        .select({
          id: schema.bids.id,
          bidNumber: schema.bids.bidNumber,
          jobName: schema.bids.jobName,
          customerName: schema.bids.customerName,
          estimatorName: schema.bids.estimatorName,
          branch: schema.bids.branch,
          status: schema.bids.status,
          createdAt: schema.bids.createdAt,
          updatedAt: schema.bids.updatedAt,
        })
        .from(schema.bids)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.bids.updatedAt))
        .limit(limit);

      estimatorRows = rows.map((r) => ({
        id: r.id,
        source: 'estimator' as const,
        name: r.jobName,
        customer: r.customerName ?? null,
        customerId: null,
        estimator: r.estimatorName ?? null,
        status: r.status ?? 'draft',
        planType: null,
        logDate: r.createdAt ? r.createdAt.toISOString() : null,
        dueDate: null,
        branch: r.branch ?? null,
        specs: [],
        href: `/?bid=${r.id}`,
      }));
    }

    // Merge and sort by logDate desc
    const all = [...legacyRows, ...estimatorRows].sort((a, b) => {
      const da = a.logDate ? new Date(a.logDate).getTime() : 0;
      const db2 = b.logDate ? new Date(b.logDate).getTime() : 0;
      return db2 - da;
    });

    return NextResponse.json({
      bids: all,
      counts: {
        legacy: legacyRows.length,
        estimator: estimatorRows.length,
        total: all.length,
      },
    });
  } catch (err) {
    console.error('[all-bids API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
