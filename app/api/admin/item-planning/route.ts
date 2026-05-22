import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getDb } from '../../../../db/index';
import { itemPlanning } from '../../../../db/schema';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

// GET /api/admin/item-planning?branch=20GR&category=millwork&critical=1&paused=0&q=lvl&limit=200&offset=0
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  const sp = req.nextUrl.searchParams;
  const branch   = sp.get('branch') ?? '';
  const category = sp.get('category') ?? '';
  const critical = sp.get('critical') === '1';
  const paused   = sp.get('paused');
  const q        = (sp.get('q') ?? '').trim();
  const limit    = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '200', 10) || 200));
  const offset   = Math.max(0, parseInt(sp.get('offset') ?? '0', 10) || 0);

  try {
    const db = getDb();
    const where = [];
    if (branch)   where.push(eq(itemPlanning.systemId, branch));
    if (category) where.push(eq(itemPlanning.category, category));
    if (critical) where.push(eq(itemPlanning.isCritical, true));
    if (paused === '1') where.push(eq(itemPlanning.isPaused, true));
    if (paused === '0') where.push(eq(itemPlanning.isPaused, false));
    if (q) where.push(or(
      ilike(itemPlanning.itemCode, `%${q}%`),
      ilike(itemPlanning.notes, `%${q}%`),
      ilike(itemPlanning.category, `%${q}%`),
    ));

    const rows = await db
      .select()
      .from(itemPlanning)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(itemPlanning.updatedAt), asc(itemPlanning.itemCode))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(itemPlanning)
      .where(where.length ? and(...where) : undefined);

    return NextResponse.json({ rows, count });
  } catch (err) {
    console.error('[admin/item-planning GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/admin/item-planning   { systemId, itemCode, ...overrides }
export async function POST(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const systemId = String(body.systemId ?? '').trim();
  const itemCode = String(body.itemCode ?? '').trim();
  if (!systemId || !itemCode) {
    return NextResponse.json({ error: 'systemId and itemCode are required' }, { status: 422 });
  }
  if (!BRANCHES.includes(systemId)) {
    return NextResponse.json({ error: `systemId must be one of ${BRANCHES.join(', ')}` }, { status: 422 });
  }

  try {
    const db = getDb();
    const [row] = await db.insert(itemPlanning).values({
      systemId,
      itemCode,
      minOnHand:          body.minOnHand          == null ? null : String(body.minOnHand),
      targetOnHand:       body.targetOnHand       == null ? null : String(body.targetOnHand),
      safetyStockDays:    body.safetyStockDays    == null ? null : Number(body.safetyStockDays),
      usageWindowDays:    body.usageWindowDays    == null ? null : Number(body.usageWindowDays),
      seasonalityFactor:  body.seasonalityFactor  == null ? null : String(body.seasonalityFactor),
      seasonalityProfile: body.seasonalityProfile ?? null,
      packQty:            body.packQty            == null ? null : String(body.packQty),
      preferredSupplier:  body.preferredSupplier  == null ? null : String(body.preferredSupplier),
      isCritical:         Boolean(body.isCritical),
      category:           body.category           == null ? null : String(body.category),
      isPaused:           Boolean(body.isPaused),
      notes:              body.notes              == null ? null : String(body.notes),
      source:             (body.source as string) ?? 'manual',
      updatedBy:          session.user?.name ?? null,
    }).returning();
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err));
    if (msg.includes('duplicate key') || msg.includes('item_planning_system_item_idx')) {
      return NextResponse.json({ error: 'A row already exists for this branch + item' }, { status: 409 });
    }
    console.error('[admin/item-planning POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
