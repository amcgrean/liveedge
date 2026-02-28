import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq } from 'drizzle-orm';

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
  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  if (userRole !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  let body: Partial<typeof schema.products.$inferInsert>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.products)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.products.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ product: updated });
  } catch (err) { return dbError(err); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  if (userRole !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  try {
    const db = getDb();
    await db.update(schema.products).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.products.id, id));
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
