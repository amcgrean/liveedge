import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { getDb } from '../../../../../db/index';
import { itemPlanning } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    const db = getDb();
    const [row] = await db.select().from(itemPlanning).where(eq(itemPlanning.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error('[admin/item-planning/[id] GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;
  const { id } = await params;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  // Only update fields actually present on the body so partial PATCH works.
  const update: Record<string, unknown> = { updatedAt: new Date(), updatedBy: session.user?.name ?? null };
  const numericKeys = ['minOnHand', 'targetOnHand', 'seasonalityFactor', 'packQty'] as const;
  const intKeys     = ['safetyStockDays', 'usageWindowDays'] as const;
  const textKeys    = ['preferredSupplier', 'category', 'notes', 'source'] as const;
  const boolKeys    = ['isCritical', 'isPaused'] as const;

  for (const k of numericKeys) if (k in body) update[k] = body[k] == null ? null : String(body[k]);
  for (const k of intKeys)     if (k in body) update[k] = body[k] == null ? null : Number(body[k]);
  for (const k of textKeys)    if (k in body) update[k] = body[k] == null ? null : String(body[k]);
  for (const k of boolKeys)    if (k in body) update[k] = Boolean(body[k]);
  if ('seasonalityProfile' in body) update.seasonalityProfile = body.seasonalityProfile ?? null;

  try {
    const db = getDb();
    const [row] = await db.update(itemPlanning).set(update).where(eq(itemPlanning.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error('[admin/item-planning/[id] PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    const db = getDb();
    const [row] = await db.delete(itemPlanning).where(eq(itemPlanning.id, id)).returning();
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/item-planning/[id] DELETE]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
