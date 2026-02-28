import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getDb, schema } from '../../../../../db/index';
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
  let body: { name?: string; role?: string; isActive?: boolean; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const update: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (body.name) update.name = body.name.trim();
  if (body.role) update.role = body.role;
  if (body.isActive !== undefined) update.isActive = body.isActive;
  if (body.password) update.passwordHash = await bcrypt.hash(body.password, 12);

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.users)
      .set(update)
      .where(eq(schema.users.id, id))
      .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, isActive: schema.users.isActive });
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ user: updated });
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

  // Prevent self-deletion
  if (id === session.user?.id) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 });
  }

  try {
    const db = getDb();
    await db.update(schema.users).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.users.id, id));
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
