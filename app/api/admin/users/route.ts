import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyUser, legacyUserType } from '../../../../db/schema-legacy';
import { eq, desc, ilike } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { Session } from 'next-auth';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[admin/users API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

async function requireAdmin(session: Session | null) {
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  return null;
}

function deriveRole(row: { isAdmin: boolean | null; isEstimator: boolean | null; isCommercialEstimator: boolean | null }): string {
  if (row.isAdmin) return 'admin';
  if (row.isEstimator || row.isCommercialEstimator) return 'estimator';
  return 'viewer';
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  const err = await requireAdmin(session);
  if (err) return err;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id:                    legacyUser.id,
        username:              legacyUser.username,
        email:                 legacyUser.email,
        isAdmin:               legacyUser.isAdmin,
        isEstimator:           legacyUser.isEstimator,
        isCommercialEstimator: legacyUser.isCommercialEstimator,
        isActive:              legacyUser.isActive,
        createdAt:             legacyUser.createdAt,
      })
      .from(legacyUser)
      .orderBy(desc(legacyUser.createdAt));

    return NextResponse.json({
      users: rows.map((r) => ({
        id:        String(r.id),
        name:      r.username,
        email:     r.email,
        role:      deriveRole(r),
        isActive:  r.isActive ?? true,
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date(0).toISOString(),
      })),
    });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const adminErr = await requireAdmin(session);
  if (adminErr) return adminErr;

  let body: { username?: string; name?: string; email: string; role: string; password: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const username = (body.username ?? body.name ?? '').trim();
  if (!username || !body.email || !body.password) {
    return NextResponse.json({ error: 'username, email, and password are required' }, { status: 422 });
  }

  const validRoles = ['admin', 'estimator', 'viewer'];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 422 });
  }

  try {
    const db = getDb();

    // Resolve a usertypeId — pick by matching name, fall back to first available
    const allTypes = await db.select().from(legacyUserType);
    let usertypeId = allTypes[0]?.id ?? 1;
    const roleLabel = body.role === 'admin' ? 'admin' : body.role === 'estimator' ? 'estimat' : 'viewer';
    const match = allTypes.find((t) => t.name.toLowerCase().includes(roleLabel));
    if (match) usertypeId = match.id;

    const password = await bcrypt.hash(body.password, 12);
    const isAdmin      = body.role === 'admin';
    const isEstimator  = body.role === 'estimator';

    const [user] = await db
      .insert(legacyUser)
      .values({
        username,
        email: body.email.toLowerCase().trim(),
        password,
        usertypeId,
        isAdmin,
        isEstimator,
        isCommercialEstimator: false,
        isResidentialEstimator: false,
        isDesigner: false,
        isActive: true,
      })
      .returning({
        id:       legacyUser.id,
        username: legacyUser.username,
        email:    legacyUser.email,
        isAdmin:  legacyUser.isAdmin,
        isActive: legacyUser.isActive,
        createdAt: legacyUser.createdAt,
      });

    return NextResponse.json({
      user: {
        id:        String(user.id),
        name:      user.username,
        email:     user.email,
        role:      body.role,
        isActive:  user.isActive ?? true,
        createdAt: user.createdAt ? user.createdAt.toISOString() : new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
