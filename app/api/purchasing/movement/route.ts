import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { fetchMovementRows } from '@/lib/purchasing/movement';

// GET /api/purchasing/movement
//   ?branch=20GR
//   &direction=up|down|all   (default 'all')
//   &min_pct=25              (absolute % threshold, default 25)
//   &limit=50                (max 200)
//
// 7-day vs trailing-30-day shipped velocity per item × branch from
// customer_scorecard_fact. Used by /purchasing/movement (drill page)
// and by the Recent Movement tile.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAllBranchUser = hasCapability(session, 'branch.all');
  const sp = req.nextUrl.searchParams;
  const branchParam = sp.get('branch');

  let branch: string | null;
  if (!isAllBranchUser) {
    branch = session.user.branch ?? null;
    if (!branch) return NextResponse.json({ error: 'No branch on session' }, { status: 403 });
  } else {
    branch = branchParam && branchParam !== 'all' ? branchParam : null;
  }

  const directionParam = sp.get('direction') ?? 'all';
  const direction: 'up' | 'down' | 'all' =
    directionParam === 'up' || directionParam === 'down' ? directionParam : 'all';

  try {
    const rows = await fetchMovementRows({
      branch,
      direction,
      minPct: Math.max(0, parseInt(sp.get('min_pct') ?? '25', 10) || 25),
      limit:  Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50)),
    });
    return NextResponse.json({ rows });
  } catch (err) {
    console.error('[purchasing/movement GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
