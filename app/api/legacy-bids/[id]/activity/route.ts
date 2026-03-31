import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyBidActivity, legacyUser } from '../../../../../db/schema-legacy';
import { eq, asc } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const bidId = parseInt(id, 10);
  if (isNaN(bidId)) {
    return NextResponse.json({ error: 'Invalid bid ID' }, { status: 400 });
  }

  try {
    const db = getDb();
    const activity = await db
      .select({
        id: legacyBidActivity.id,
        action: legacyBidActivity.action,
        timestamp: legacyBidActivity.timestamp,
        username: legacyUser.username,
      })
      .from(legacyBidActivity)
      .leftJoin(legacyUser, eq(legacyBidActivity.userId, legacyUser.id))
      .where(eq(legacyBidActivity.bidId, bidId))
      .orderBy(asc(legacyBidActivity.timestamp));

    return NextResponse.json({ activity });
  } catch (err) {
    console.error('[legacy-bids activity API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
