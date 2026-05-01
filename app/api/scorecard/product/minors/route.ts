import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { fetchProductScorecardMinors } from '../../../../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../../../../src/lib/scorecard/types';

export async function GET(request: Request) {
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const majorCode = searchParams.get('majorCode') ?? '';
  const baseYear = parseInt(searchParams.get('baseYear') ?? String(new Date().getFullYear()), 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? String(baseYear - 1), 10);
  const period = (searchParams.get('period') ?? 'YTD') as AggregateParams['period'];
  const cutoffDate = searchParams.get('cutoffDate') ?? new Date().toISOString().slice(0, 10);
  const branchIds = searchParams.getAll('branch').filter(Boolean);

  try {
    const minors = await fetchProductScorecardMinors({ branchIds, baseYear, compareYear, period, cutoffDate }, majorCode);
    return NextResponse.json({ minors });
  } catch (err) {
    console.error('[scorecard/product/minors GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
