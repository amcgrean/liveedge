import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { fetchSalesReports } from '../../../../src/lib/sales/reports-query';

// GET /api/sales/reports?branch=&period=30
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const period = parseInt(searchParams.get('period') ?? '30', 10) || 30;

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin
    ? (searchParams.get('branch') ?? '')
    : (session.user.branch ?? '');

  try {
    const payload = await fetchSalesReports({ period, branch });
    const res = NextResponse.json(payload);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[sales/reports GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
