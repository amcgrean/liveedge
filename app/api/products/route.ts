import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb, schema } from '../../../db/index';
import { ilike, or, eq, desc, and, SQL } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[products API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const category = searchParams.get('category') ?? '';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

  try {
    const db = getDb();
    const conditions: SQL[] = [eq(schema.products.isActive, true)];
    if (category) conditions.push(eq(schema.products.category, category));
    if (q) {
      const orClause = or(
        ilike(schema.products.sku, `%${q}%`),
        ilike(schema.products.description, `%${q}%`)
      );
      if (orClause) conditions.push(orClause);
    }

    const rows = await db
      .select()
      .from(schema.products)
      .where(and(...conditions))
      .orderBy(desc(schema.products.updatedAt))
      .limit(limit);

    return NextResponse.json({ products: rows });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  if (userRole !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  let body: { sku: string; description: string; uom: string; category?: string; branchOverrides?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.sku || !body.description || !body.uom) {
    return NextResponse.json({ error: 'sku, description, and uom are required' }, { status: 422 });
  }

  try {
    const db = getDb();
    const [product] = await db
      .insert(schema.products)
      .values({
        sku: body.sku.trim().toUpperCase(),
        description: body.description.trim(),
        uom: body.uom.trim(),
        category: body.category || null,
        branchOverrides: (body.branchOverrides as Record<string, unknown>) || null,
      })
      .returning();
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
