import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { fetchOpenPickSummaries } from '../../../../src/lib/warehouse-picks';

export type { OpenPickSummary } from '../../../../src/lib/warehouse-picks';

// GET /api/warehouse/picks?branch=20GR&limit=100
// Returns open picks (distinct SOs) from ERP tables.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const branchParam = searchParams.get('branch') ?? '';
  const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '200', 10) || 200);

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  const effectiveBranch = isAdmin ? (branchParam || null) : (session.user.branch || null);

  try {
    const picks = await fetchOpenPickSummaries(effectiveBranch, limit);
    return NextResponse.json(picks);
  } catch (err) {
    console.error('[warehouse/picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
