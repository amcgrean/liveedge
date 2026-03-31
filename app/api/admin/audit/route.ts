import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyGeneralAudit, legacyUser } from '../../../../db/schema-legacy';
import { eq, desc, and, ilike, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const modelName = searchParams.get('modelName') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const conditions = [];

    if (q) {
      conditions.push(ilike(legacyGeneralAudit.action, `%${q}%`));
    }
    if (modelName) {
      conditions.push(eq(legacyGeneralAudit.modelName, modelName));
    }

    const rows = await db
      .select({
        id: legacyGeneralAudit.id,
        userId: legacyGeneralAudit.userId,
        modelName: legacyGeneralAudit.modelName,
        action: legacyGeneralAudit.action,
        timestamp: legacyGeneralAudit.timestamp,
        changes: legacyGeneralAudit.changes,
        username: legacyUser.username,
      })
      .from(legacyGeneralAudit)
      .leftJoin(legacyUser, eq(legacyGeneralAudit.userId, legacyUser.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(legacyGeneralAudit.timestamp))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(legacyGeneralAudit)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return NextResponse.json({ entries: rows, total: countResult?.count ?? 0, limit, offset });
  } catch (err) {
    console.error('[audit API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
