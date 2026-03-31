import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';
import { legacyBidField } from '../../../../db/schema-legacy';
import { eq, asc } from 'drizzle-orm';

function requireAdmin(session: { user: { role?: string } } | null) {
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  return null;
}

export async function GET() {
  const session = await auth();
  const err = requireAdmin(session);
  if (err) return err;

  try {
    const db = getDb();
    const fields = await db.select().from(legacyBidField).orderBy(asc(legacyBidField.sortOrder), asc(legacyBidField.id));
    return NextResponse.json({ fields });
  } catch (err) {
    console.error('[bid-fields API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const adminErr = requireAdmin(session);
  if (adminErr) return adminErr;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = body.name as string;
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 422 });

  try {
    const db = getDb();
    const [field] = await db.insert(legacyBidField).values({
      name,
      category: (body.category as string) ?? 'General',
      fieldType: (body.fieldType as string) ?? 'text',
      isRequired: (body.isRequired as boolean) ?? false,
      options: (body.options as string) ?? null,
      defaultValue: (body.defaultValue as string) ?? null,
      sortOrder: (body.sortOrder as number) ?? 0,
      isActive: body.isActive !== false,
      branchIds: (body.branchIds as string) ?? null,
    }).returning();
    return NextResponse.json({ field }, { status: 201 });
  } catch (err) {
    console.error('[bid-fields API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Bulk reorder
export async function PUT(req: NextRequest) {
  const session = await auth();
  const adminErr = requireAdmin(session);
  if (adminErr) return adminErr;

  let body: { order: { id: number; sortOrder: number }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!Array.isArray(body.order)) return NextResponse.json({ error: 'order array is required' }, { status: 422 });

  try {
    const db = getDb();
    for (const item of body.order) {
      await db.update(legacyBidField).set({ sortOrder: item.sortOrder }).where(eq(legacyBidField.id, item.id));
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[bid-fields API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
