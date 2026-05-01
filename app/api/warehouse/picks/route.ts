import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { fetchOpenPickSummaries } from '../../../../src/lib/warehouse-picks';

export type { OpenPickSummary } from '../../../../src/lib/warehouse-picks';

// GET /api/warehouse/picks?branch=20GR&limit=100
// Returns open picks (distinct SOs) from ERP tables.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const branchParam = searchParams.get('branch') ?? '';
  const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '200', 10) || 200);

  const isAdmin = hasCapability(session, 'branch.all');
  const effectiveBranch = isAdmin ? (branchParam || null) : (session.user.branch || null);

  try {
    const picks = await fetchOpenPickSummaries(effectiveBranch, limit);
    return NextResponse.json(picks);
  } catch (err) {
    console.error('[warehouse/picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
