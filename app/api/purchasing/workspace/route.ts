import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { buildWorkspaceFeed } from '@/lib/purchasing/workspace-aggregator';

// GET /api/purchasing/workspace
//   ?branch=20GR        (admin/branch.all may pass 'all' or omit for all branches)
//
// Aggregates the six tile feeds for /purchasing/workspace into a single
// response. Non-branch.all users get pinned to their session branch.
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAllBranchUser = hasCapability(session, 'branch.all');
  const branchParam = req.nextUrl.searchParams.get('branch');

  let branch: string | null;
  if (!isAllBranchUser) {
    branch = session.user.branch ?? null;
    if (!branch) return NextResponse.json({ error: 'No branch on session' }, { status: 403 });
  } else {
    branch = branchParam && branchParam !== 'all' ? branchParam : null;
  }

  try {
    const feed = await buildWorkspaceFeed({ branch });
    return NextResponse.json(feed);
  } catch (err) {
    console.error('[purchasing/workspace GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
