import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyBid, legacyCustomer } from '../../../../db/schema-legacy';
import { eq, and, sql, between } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

// GET /api/legacy-bids/calendar?year=2026&month=5
// Returns incomplete bids whose dueDate falls in the given month (or current month if omitted).
// Also returns bids due in the adjacent months so the client can show overflow days.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year  = parseInt(searchParams.get('year')  ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1), 10); // 1-based

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 });
  }

  // Expand range by one month on each side so the calendar grid can show overflow
  const start = new Date(year, month - 2, 1); // first of prev month
  const end   = new Date(year, month + 1, 0); // last of next month

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    const conditions = [
      eq(legacyBid.status, 'Incomplete'),
      sql`${legacyBid.dueDate} is not null`,
      between(legacyBid.dueDate, start, end),
    ];
    if (branchId) conditions.push(eq(legacyBid.branchId, branchId));

    const rows = await db
      .select({
        id: legacyBid.id,
        projectName: legacyBid.projectName,
        planType: legacyBid.planType,
        dueDate: legacyBid.dueDate,
        customerName: legacyCustomer.name,
        estimatorName: sql<string | null>`null`, // not joining estimator for perf
      })
      .from(legacyBid)
      .leftJoin(legacyCustomer, eq(legacyBid.customerId, legacyCustomer.id))
      .where(and(...conditions))
      .orderBy(legacyBid.dueDate);

    return NextResponse.json({
      year,
      month,
      bids: rows.map((r) => ({
        id: r.id,
        projectName: r.projectName,
        planType: r.planType ?? 'Residential',
        dueDate: r.dueDate ? (r.dueDate instanceof Date ? r.dueDate.toISOString() : r.dueDate) : null,
        customerName: r.customerName ?? null,
      })),
    });
  } catch (err) {
    console.error('[legacy-bids/calendar]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
