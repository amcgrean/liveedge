import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getDb } from '../../../../db/index';
import { branchPlanningDefaults } from '../../../../db/schema';
import { asc, eq, sql } from 'drizzle-orm';

const BRANCHES = ['10FD', '20GR', '25BW', '40CV'];

// GET /api/admin/branch-planning-defaults
// Returns every branch — synthesizes a default row for branches that don't
// have an explicit override yet so the UI shows a complete table.
export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const db = getDb();
    const rows = await db.select().from(branchPlanningDefaults).orderBy(asc(branchPlanningDefaults.systemId));
    const byBranch = new Map(rows.map((r) => [r.systemId, r]));

    const merged = BRANCHES.map((b) => byBranch.get(b) ?? {
      systemId: b,
      usageWindowDays: 90,
      safetyStockDays: 7,
      seasonalityProfile: null,
      updatedBy: null,
      updatedAt: null,
      createdAt: null,
      _synthetic: true,
    });

    return NextResponse.json({ rows: merged });
  } catch (err) {
    console.error('[admin/branch-planning-defaults GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/admin/branch-planning-defaults   { systemId, usageWindowDays?, safetyStockDays?, seasonalityProfile? }
// Upsert by systemId.
export async function PUT(req: NextRequest) {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const systemId = String(body.systemId ?? '').trim();
  if (!systemId || !BRANCHES.includes(systemId)) {
    return NextResponse.json({ error: `systemId must be one of ${BRANCHES.join(', ')}` }, { status: 422 });
  }

  const usageWindowDays = body.usageWindowDays == null ? 90 : Math.max(1, Math.min(730, Number(body.usageWindowDays) || 90));
  const safetyStockDays = body.safetyStockDays == null ? 7  : Math.max(0, Math.min(365, Number(body.safetyStockDays) || 7));
  const seasonalityProfile = body.seasonalityProfile ?? null;
  if (seasonalityProfile != null) {
    if (!Array.isArray(seasonalityProfile) || seasonalityProfile.length !== 12) {
      return NextResponse.json({ error: 'seasonalityProfile must be a 12-element array or null' }, { status: 422 });
    }
  }

  try {
    const db = getDb();
    const [row] = await db.insert(branchPlanningDefaults).values({
      systemId,
      usageWindowDays,
      safetyStockDays,
      seasonalityProfile,
      updatedBy: session.user?.name ?? null,
    }).onConflictDoUpdate({
      target: branchPlanningDefaults.systemId,
      set: {
        usageWindowDays,
        safetyStockDays,
        seasonalityProfile,
        updatedBy: session.user?.name ?? null,
        updatedAt: sql`now()`,
      },
    }).returning();

    return NextResponse.json({ row });
  } catch (err) {
    console.error('[admin/branch-planning-defaults PUT]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
