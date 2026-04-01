import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb } from '../../../../../db/index';
import { legacyUser } from '../../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: { name?: string; role?: string; isActive?: boolean; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name) update.username = body.name.trim();
  if (body.isActive !== undefined) update.isActive = body.isActive;
  if (body.password) update.password = await bcrypt.hash(body.password, 12);
  if (body.role) {
    update.isAdmin               = body.role === 'admin';
    update.isEstimator           = body.role === 'estimator';
    update.isCommercialEstimator = false;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(legacyUser)
      .set(update)
      .where(eq(legacyUser.id, userId))
      .returning({
        id:       legacyUser.id,
        username: legacyUser.username,
        email:    legacyUser.email,
        isAdmin:  legacyUser.isAdmin,
        isActive: legacyUser.isActive,
      });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      user: {
        id:    String(updated.id),
        name:  updated.username,
        email: updated.email,
        role:  updated.isAdmin ? 'admin' : 'estimator',
        isActive: updated.isActive ?? true,
      },
    });
  } catch (err) { return dbError(err); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  if (id === session.user?.id) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    const db = getDb();
    await db.update(legacyUser).set({ isActive: false, updatedAt: new Date() }).where(eq(legacyUser.id, userId));
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
