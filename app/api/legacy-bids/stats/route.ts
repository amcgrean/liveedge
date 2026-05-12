import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyBid, legacyEstimator } from '../../../../db/schema-legacy';
import { eq, and, sql } from 'drizzle-orm';

// GET /api/legacy-bids/stats
// Returns aggregate stats for completed bids: by estimator, by plan type, avg turnaround.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();

    const completedFilter = eq(legacyBid.status, 'Complete');

    // Total count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(completedFilter);

    // By plan type
    const byPlanType = await db
      .select({
        planType: legacyBid.planType,
        count: sql<number>`count(*)::int`,
      })
      .from(legacyBid)
      .where(completedFilter)
      .groupBy(legacyBid.planType)
      .orderBy(sql`count(*) desc`);

    // By estimator (join for name)
    const byEstimator = await db
      .select({
        estimatorName: legacyEstimator.estimatorName,
        count: sql<number>`count(*)::int`,
      })
      .from(legacyBid)
      .leftJoin(legacyEstimator, eq(legacyBid.estimatorId, legacyEstimator.estimatorID))
      .where(completedFilter)
      .groupBy(legacyEstimator.estimatorName)
      .orderBy(sql`count(*) desc`);

    // Average turnaround days (logDate → completionDate)
    const [avgRow] = await db
      .select({
        avgDays: sql<number>`round(avg(extract(epoch from (completion_date - log_date)) / 86400))::int`,
      })
      .from(legacyBid)
      .where(
        and(
          completedFilter,
          sql`completion_date is not null`,
          sql`log_date is not null`,
        )
      );

    // Completed this month / this year
    const [thisMonthRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(
        and(
          completedFilter,
          sql`date_trunc('month', completion_date) = date_trunc('month', now())`,
        )
      );

    const [thisYearRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(
        and(
          completedFilter,
          sql`date_trunc('year', completion_date) = date_trunc('year', now())`,
        )
      );

    return NextResponse.json({
      total: countRow?.count ?? 0,
      thisMonth: thisMonthRow?.count ?? 0,
      thisYear: thisYearRow?.count ?? 0,
      avgDays: avgRow?.avgDays ?? null,
      byPlanType: byPlanType.map((r) => ({
        planType: r.planType ?? 'Unknown',
        count: r.count,
      })),
      byEstimator: byEstimator
        .filter((r) => r.estimatorName)
        .map((r) => ({
          name: r.estimatorName!,
          count: r.count,
        })),
    });
  } catch (err) {
    console.error('[legacy-bids/stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
