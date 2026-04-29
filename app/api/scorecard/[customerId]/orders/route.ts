import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { fetchProductOrders } from '../../../../../src/lib/scorecard/queries';
import type { ScorecardParams } from '../../../../../src/lib/scorecard/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { customerId } = await params;
  const sp = req.nextUrl.searchParams;

  const majorCode = sp.get('majorCode') ?? '';
  const minorCode = sp.get('minorCode') ?? '';
  const itemNumber = sp.get('itemNumber') ?? '';
  const baseYear = parseInt(sp.get('baseYear') ?? String(new Date().getFullYear()), 10);
  const compareYear = parseInt(sp.get('compareYear') ?? String(baseYear - 1), 10);
  const period = (sp.get('period') ?? 'YTD') as ScorecardParams['period'];
  const cutoffDate = sp.get('cutoffDate') ?? new Date().toISOString().slice(0, 10);
  const branchIds = sp.getAll('branch').filter(Boolean);

  try {
    const orders = await fetchProductOrders(
      { customerId, branchIds, baseYear, compareYear, period, cutoffDate },
      majorCode,
      minorCode,
      itemNumber,
    );
    return NextResponse.json({ orders });
  } catch (err) {
    console.error('[scorecard/orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
