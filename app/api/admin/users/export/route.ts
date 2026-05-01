import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { legacyUser, legacyUserType } from '../../../../../db/schema-legacy';
import { eq, asc } from 'drizzle-orm';
import { generateCSV, csvResponse } from '@/lib/csv-utils';

export async function GET() {
  const authResult = await requireCapability('admin.users.manage');
  if (authResult instanceof NextResponse) return authResult;

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
