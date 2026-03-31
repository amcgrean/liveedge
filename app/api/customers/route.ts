import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../auth';
import { getDb } from '../../../db/index';
import { legacyCustomer } from '../../../db/schema-legacy';
import { ilike, or, desc } from 'drizzle-orm';

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
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);

  try {
    const db = getDb();
    const conditions = [];

    if (q) {
      conditions.push(
        or(
          ilike(legacyCustomer.name, `%${q}%`),
          ilike(legacyCustomer.customerCode, `%${q}%`)
        )
      );
    }

    const rows = await db
      .select()
      .from(legacyCustomer)
      .where(conditions.length > 0 ? conditions[0] : undefined)
      .orderBy(desc(legacyCustomer.id))
      .limit(limit);

    // Map to the shape the admin UI expects
    const customers = rows.map((r) => ({
      id: String(r.id),
      code: r.customerCode,
      name: r.name,
      address: null,
      city: null,
      state: null,
      zip: null,
      phone: null,
      email: null,
      contactName: r.salesAgent,
      notes: null,
      isActive: true,
      createdAt: new Date().toISOString(),
    }));

    return NextResponse.json({ customers });
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

  let body: { code?: string; name: string; contactName?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Customer name is required' }, { status: 422 });
  }

  try {
    const db = getDb();
    const [customer] = await db
      .insert(legacyCustomer)
      .values({
        customerCode: body.code || `CUST-${Date.now()}`,
        name: body.name.trim(),
        salesAgent: body.contactName || null,
      })
      .returning();

    return NextResponse.json({
      customer: {
        id: String(customer.id),
        code: customer.customerCode,
        name: customer.name,
        isActive: true,
      },
    }, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
