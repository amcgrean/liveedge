import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getDb } from '../../../../db/index';
import { legacyCustomer } from '../../../../db/schema-legacy';
import { eq } from 'drizzle-orm';

function dbError(err: unknown) {
  console.error('[customers/[id] API]', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('admin.customers.view', 'admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [row] = await db.select().from(legacyCustomer).where(eq(legacyCustomer.id, custId)).limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      customer: {
        id: String(row.id),
        code: row.customerCode,
        name: row.name,
        contactName: row.salesAgent,
        isActive: true,
      },
    });
  } catch (err) { return dbError(err); }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('admin.customers.view', 'admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const db = getDb();
    const updates: Record<string, unknown> = {};
    if (body.name) updates.name = body.name;
    if (body.code) updates.customerCode = body.code;
    if (body.contactName !== undefined) updates.salesAgent = body.contactName;

    const [updated] = await db
      .update(legacyCustomer)
      .set(updates)
      .where(eq(legacyCustomer.id, custId))
      .returning();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      customer: { id: String(updated.id), code: updated.customerCode, name: updated.name, isActive: true },
    });
  } catch (err) { return dbError(err); }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireCapability('admin.customers.view', 'admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const custId = parseInt(id, 10);
  if (isNaN(custId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const db = getDb();
    const [deleted] = await db.delete(legacyCustomer).where(eq(legacyCustomer.id, custId)).returning({ id: legacyCustomer.id });
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) { return dbError(err); }
}
