import { NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import {
  legacyBid,
  legacyDesign,
  legacyBidActivity,
} from '../../../db/schema-legacy';
import { eq, sql, and } from 'drizzle-orm';
import { getSelectedBranchId } from '@/lib/branch-context';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json(
      { error: 'Database not configured.' },
      { status: 503 }
    );
  }
  console.error('[dashboard API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const branchId = await getSelectedBranchId();

    // Build branch filter
    const branchFilter = branchId
      ? eq(legacyBid.branchId, branchId)
      : undefined;
    const designBranchFilter = branchId
      ? eq(legacyDesign.branchId, branchId)
      : undefined;

    // Open bids count
    const [openBidsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(
        branchFilter
          ? and(eq(legacyBid.status, 'Incomplete'), branchFilter)
          : eq(legacyBid.status, 'Incomplete')
      );

    // Open designs count
    const [openDesignsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyDesign)
      .where(
        designBranchFilter
          ? and(eq(legacyDesign.status, 'Active'), designBranchFilter)
          : eq(legacyDesign.status, 'Active')
      );

    // YTD completed bids
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [ytdResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyBid)
      .where(
        and(
          eq(legacyBid.status, 'Complete'),
          sql`${legacyBid.completionDate} >= ${yearStart}`,
          ...(branchFilter ? [branchFilter] : [])
        )
      );

    // Average completion time (days) for YTD completed bids
    const [avgResult] = await db
      .select({
        avgDays: sql<number>`coalesce(avg(extract(epoch from (${legacyBid.completionDate} - ${legacyBid.logDate})) / 86400)::int, 0)`,
      })
      .from(legacyBid)
      .where(
        and(
          eq(legacyBid.status, 'Complete'),
          sql`${legacyBid.completionDate} is not null`,
          sql`${legacyBid.completionDate} >= ${yearStart}`,
          ...(branchFilter ? [branchFilter] : [])
        )
      );

    // Recent activity (last 20 entries) — non-fatal: empty array if query fails
    let recentActivity: { id: number; bidId: number; action: string; timestamp: Date | null }[] = [];
    try {
      recentActivity = await db
        .select({
          id: legacyBidActivity.id,
          bidId: legacyBidActivity.bidId,
          action: legacyBidActivity.action,
          timestamp: legacyBidActivity.timestamp,
        })
        .from(legacyBidActivity)
        .orderBy(sql`${legacyBidActivity.timestamp} desc`)
        .limit(20);
    } catch (actErr) {
      console.error('[dashboard API] recentActivity query failed:', actErr);
    }

    return NextResponse.json({
      openBids: openBidsResult?.count ?? 0,
      openDesigns: openDesignsResult?.count ?? 0,
      ytdCompleted: ytdResult?.count ?? 0,
      avgCompletionDays: avgResult?.avgDays ?? 0,
      recentActivity,
    });
  } catch (err) {
    return dbError(err);
  }
}
