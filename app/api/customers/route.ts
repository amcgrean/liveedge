import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb, schema } from '../../../db/index';
import { ilike, or, eq, desc } from 'drizzle-orm';

function dbError(err: unknown) {
  if (err instanceof Error && err.message.includes('DATABASE_URL')) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  console.error('[customers API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const activeOnly = searchParams.get('active') !== 'false';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

  try {
    const db = getDb();

    const conditions = [];
    if (activeOnly) conditions.push(eq(schema.customers.isActive, true));
    if (q) {
      conditions.push(
        or(
          ilike(schema.customers.name, `%${q}%`),
          ilike(schema.customers.code, `%${q}%`),
          ilike(schema.customers.email, `%${q}%`)
        )
      );
    }

    const rows = await db
      .select()
      .from(schema.customers)
      .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : undefined) : undefined)
      .orderBy(desc(schema.customers.createdAt))
      .limit(limit);

    return NextResponse.json({ customers: rows });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRole = (session.user as { role?: string }).role ?? 'estimator';
  if (userRole !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: {
    code?: string;
    name: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    email?: string;
    contactName?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 422 });
  }

  try {
    const db = getDb();
    const [customer] = await db
      .insert(schema.customers)
      .values({
        code: body.code || null,
        name: body.name.trim(),
        address: body.address || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        phone: body.phone || null,
        email: body.email || null,
        contactName: body.contactName || null,
        notes: body.notes || null,
        createdBy: session.user?.id ?? null,
      })
      .returning();

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
