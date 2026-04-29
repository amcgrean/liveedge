import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { fetchBranchStats } from '../../../../src/lib/warehouse-stats';
export type { BranchStats } from '../../../../src/lib/warehouse-stats';

// GET /api/warehouse/stats
// Returns per-branch open pick order and work order counts (by order, not by line).
// Non-admin users get their branch only.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
