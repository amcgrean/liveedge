import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import {
  fetchReplenishmentRows,
  buildSupplierRollup,
  type ReplenishmentView,
} from '@/lib/purchasing/replenishment';

// GET /api/purchasing/replenishment
//   ?branch=20GR        (defaults to user's branch; admin/branch.all may pass empty for ALL)
//   &view=suggested|outages|all   (default: suggested)
//   &category=millwork
//   &supplier=515
//   &critical=1
//   &q=mwl-1x4
//   &limit=500          (max 2000)
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAllBranchUser = hasCapability(session, 'branch.all');

  const sp = req.nextUrl.searchParams;
  const branchParam = sp.get('branch');

  // Resolve the branch the engine will query.
  //   • For users without branch.all, force their session branch.
  //   • For users with branch.all, empty / 'all' means "no branch filter".
  let branch: string | null;
  if (!isAllBranchUser) {
    branch = session.user.branch ?? null;
    if (!branch) {
      return NextResponse.json({ error: 'No branch on session' }, { status: 403 });
    }
  } else {
    branch = branchParam && branchParam !== 'all' ? branchParam : null;
  }

  const viewParam = (sp.get('view') ?? 'suggested') as ReplenishmentView;
  const view: ReplenishmentView =
    viewParam === 'outages' || viewParam === 'all' || viewParam === 'suggested'
      ? viewParam
      : 'suggested';

  const filters = {
    branch,
    category:     sp.get('category'),
    supplier:     sp.get('supplier'),
    view,
    criticalOnly: sp.get('critical') === '1',
    search:       sp.get('q') ?? '',
    limit:        Math.min(2000, Math.max(1, parseInt(sp.get('limit') ?? '500', 10) || 500)),
  };

  try {
    const rows = await fetchReplenishmentRows(filters);
    const supplierRollup = buildSupplierRollup(rows);

    const summary = {
      total:        rows.length,
      red:          rows.filter((r) => r.severity === 'red').length,
      amber:        rows.filter((r) => r.severity === 'amber').length,
      yellow:       rows.filter((r) => r.severity === 'yellow').length,
      critical:     rows.filter((r) => r.isCritical).length,
      totalSuggestedQty: rows.reduce((s, r) => s + r.suggestedQty, 0),
    };

    return NextResponse.json({
      rows,
      summary,
      supplierRollup,
      filters: { ...filters, view, branch },
    });
  } catch (err) {
    console.error('[purchasing/replenishment GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
