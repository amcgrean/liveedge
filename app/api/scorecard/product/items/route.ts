import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { fetchProductScorecardItems } from '../../../../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../../../../src/lib/scorecard/types';

export async function GET(request: Request) {
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const majorCode = searchParams.get('majorCode') ?? '';
  const minorCode = searchParams.get('minorCode') ?? '';
  const baseYear = parseInt(searchParams.get('baseYear') ?? String(new Date().getFullYear()), 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? String(baseYear - 1), 10);
  const period = (searchParams.get('period') ?? 'YTD') as AggregateParams['period'];
  const cutoffDate = searchParams.get('cutoffDate') ?? new Date().toISOString().slice(0, 10);
  const branchIds = searchParams.getAll('branch').filter(Boolean);

  try {
    const items = await fetchProductScorecardItems({ branchIds, baseYear, compareYear, period, cutoffDate }, majorCode, minorCode);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[scorecard/product/items GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
