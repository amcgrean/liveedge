import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[customers/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

function requireAdmin(role: string) {
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const db = getDb();
    const [row] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ customer: row });
  } catch (err) { return dbError(err); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  const adminCheck = requireAdmin(userRole);
  if (adminCheck) return adminCheck;

  const { id } = await params;
  let body: Partial<typeof schema.customers.$inferInsert>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.customers)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.customers.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ customer: updated });
  } catch (err) { return dbError(err); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  const adminCheck = requireAdmin(userRole);
  if (adminCheck) return adminCheck;

  const { id } = await params;
  try {
    const db = getDb();
    await db.update(schema.customers).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.customers.id, id));
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
