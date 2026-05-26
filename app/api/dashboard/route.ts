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
    const yearStart = `${new Date().getFullYear()}-01-01`;

    // All five reads are independent; fan them out in parallel. The activity
    // query is wrapped in .catch so a failure there can't take down the page.
    const [
      openBidsResult,
      openDesignsResult,
      ytdResult,
      avgResult,
      recentActivity,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(legacyBid)
        .where(
          branchFilter
            ? and(eq(legacyBid.status, 'Incomplete'), branchFilter)
            : eq(legacyBid.status, 'Incomplete')
        )
        .then((r) => r[0]),
      db.select({ count: sql<number>`count(*)::int` })
        .from(legacyDesign)
        .where(
          designBranchFilter
            ? and(eq(legacyDesign.status, 'Active'), designBranchFilter)
            : eq(legacyDesign.status, 'Active')
        )
        .then((r) => r[0]),
      db.select({ count: sql<number>`count(*)::int` })
        .from(legacyBid)
        .where(
          and(
            eq(legacyBid.status, 'Complete'),
            sql`${legacyBid.completionDate} >= ${yearStart}`,
            ...(branchFilter ? [branchFilter] : [])
          )
        )
        .then((r) => r[0]),
      db.select({
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
        )
        .then((r) => r[0]),
      db.select({
          id: legacyBidActivity.id,
          bidId: legacyBidActivity.bidId,
          action: legacyBidActivity.action,
          timestamp: legacyBidActivity.timestamp,
        })
        .from(legacyBidActivity)
        .orderBy(sql`${legacyBidActivity.timestamp} desc`)
        .limit(20)
        .catch((actErr) => {
          console.error('[dashboard API] recentActivity query failed:', actErr);
          return [] as { id: number; bidId: number; action: string | null; timestamp: Date | null }[];
        }),
    ]);

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
