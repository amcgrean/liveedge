import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyUser, legacyUserType } from '../../../../../db/schema-legacy';
import { eq, asc } from 'drizzle-orm';
import { generateCSV, csvResponse } from '@/lib/csv-utils';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: legacyUser.id,
        username: legacyUser.username,
        email: legacyUser.email,
        isActive: legacyUser.isActive,
        isAdmin: legacyUser.isAdmin,
        isEstimator: legacyUser.isEstimator,
        isDesigner: legacyUser.isDesigner,
        userType: legacyUserType.name,
        createdAt: legacyUser.createdAt,
      })
      .from(legacyUser)
      .leftJoin(legacyUserType, eq(legacyUser.usertypeId, legacyUserType.id))
      .orderBy(asc(legacyUser.username));

    const csv = generateCSV(rows);
    return csvResponse(csv, `users-${new Date().toISOString().split('T')[0]}.csv`);
  } catch (err) {
    console.error('[users/export]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
