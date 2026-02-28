import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq, desc } from 'drizzle-orm';
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

export async function GET(_req: NextRequest) {
  const session = await auth();
  const err = await requireAdmin(session);
  if (err) return err;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .orderBy(desc(schema.users.createdAt));

    return NextResponse.json({ users: rows });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const adminErr = await requireAdmin(session);
  if (adminErr) return adminErr;

  let body: { email: string; name: string; role: string; password: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.email || !body.name || !body.password) {
    return NextResponse.json({ error: 'email, name, and password are required' }, { status: 422 });
  }

  const validRoles = ['admin', 'estimator', 'viewer'];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(', ')}` }, { status: 422 });
  }

  try {
    const db = getDb();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: body.email.toLowerCase().trim(),
        name: body.name.trim(),
        role: body.role,
        passwordHash,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
      });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
