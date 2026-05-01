import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { fetchBranchStats } from '../../../../src/lib/warehouse-stats';
export type { BranchStats } from '../../../../src/lib/warehouse-stats';

// GET /api/warehouse/stats
// Returns per-branch open pick order and work order counts (by order, not by line).
// Non-admin users get their branch only.
export async function GET() {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r: string) => ['admin', 'supervisor', 'ops'].includes(r));

  try {
    const result = await fetchBranchStats(isAdmin, session.user.branch);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[warehouse/stats GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
