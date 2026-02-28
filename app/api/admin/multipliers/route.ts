import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb, schema } from '../../../../db/index';
import { eq, desc } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[admin/multipliers API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.multipliers)
      .orderBy(schema.multipliers.category, schema.multipliers.key);
    return NextResponse.json({ multipliers: rows });
  } catch (err) {
    return dbError(err);
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  let body: { id: string; value: string }[];
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of { id, value } updates' }, { status: 422 });
  }

  try {
    const db = getDb();
    const results = [];
    for (const item of body) {
      const [updated] = await db
        .update(schema.multipliers)
        .set({
          value: String(item.value),
          updatedAt: new Date(),
          updatedBy: session.user?.id ?? null,
        })
        .where(eq(schema.multipliers.id, item.id))
        .returning();
      if (updated) results.push(updated);
    }
    return NextResponse.json({ updated: results });
  } catch (err) {
    return dbError(err);
  }
}
