import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../../auth';
import { getDb } from '../../../../../../db/index';
import { legacyUser, legacyUserSecurity, legacyUserType } from '../../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await context.params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();

    // Get user with their user type
    const userRows = await db
      .select({
        id: legacyUser.id,
        username: legacyUser.username,
        email: legacyUser.email,
        usertypeId: legacyUser.usertypeId,
        userTypeName: legacyUserType.name,
      })
      .from(legacyUser)
      .leftJoin(legacyUserType, eq(legacyUser.usertypeId, legacyUserType.id))
      .where(eq(legacyUser.id, userId))
      .limit(1);

    if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const user = userRows[0];

    // Get permissions for user's type
    const secRows = await db
      .select()
      .from(legacyUserSecurity)
      .where(eq(legacyUserSecurity.userTypeId, user.usertypeId))
      .limit(1);

    // Get all user types for the dropdown
    const userTypes = await db.select().from(legacyUserType);

    return NextResponse.json({
      user: { id: user.id, username: user.username, email: user.email, usertypeId: user.usertypeId, userTypeName: user.userTypeName },
      permissions: secRows[0] ?? null,
      userTypes,
    });
  } catch (err) {
    console.error('[permissions API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await context.params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();

    // If changing user type
    if (body.usertypeId !== undefined) {
      await db.update(legacyUser).set({ usertypeId: body.usertypeId as number }).where(eq(legacyUser.id, userId));
    }

    // If updating permissions directly on the user's current type
    if (body.permissions) {
      const userRows = await db.select({ usertypeId: legacyUser.usertypeId }).from(legacyUser).where(eq(legacyUser.id, userId)).limit(1);
      if (userRows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const userTypeId = body.usertypeId as number ?? userRows[0].usertypeId;

      const perms = body.permissions as Record<string, boolean>;
      const allowed = [
        'admin', 'estimating', 'bidRequest', 'design', 'ewp', 'service', 'install',
        'picking', 'workOrders', 'dashboards',
        'security10', 'security11', 'security12', 'security13', 'security14',
        'security15', 'security16', 'security17', 'security18', 'security19', 'security20',
      ];
      const updates: Record<string, boolean> = {};
      for (const f of allowed) {
        if (f in perms) updates[f] = perms[f];
      }

      // Upsert — try update first, insert if not found
      const existing = await db.select({ userTypeId: legacyUserSecurity.userTypeId }).from(legacyUserSecurity).where(eq(legacyUserSecurity.userTypeId, userTypeId)).limit(1);
      if (existing.length > 0) {
        await db.update(legacyUserSecurity).set(updates).where(eq(legacyUserSecurity.userTypeId, userTypeId));
      } else {
        await db.insert(legacyUserSecurity).values({
          userTypeId,
          admin: updates.admin ?? false,
          estimating: updates.estimating ?? false,
          bidRequest: updates.bidRequest ?? false,
          design: updates.design ?? false,
          ewp: updates.ewp ?? false,
          service: updates.service ?? false,
          install: updates.install ?? false,
          picking: updates.picking ?? false,
          workOrders: updates.workOrders ?? false,
          dashboards: updates.dashboards ?? false,
          security10: updates.security10 ?? false,
          security11: updates.security11 ?? false,
          security12: updates.security12 ?? false,
          security13: updates.security13 ?? false,
          security14: updates.security14 ?? false,
          security15: updates.security15 ?? false,
          security16: updates.security16 ?? false,
          security17: updates.security17 ?? false,
          security18: updates.security18 ?? false,
          security19: updates.security19 ?? false,
          security20: updates.security20 ?? false,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[permissions API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
