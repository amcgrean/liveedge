import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../../src/lib/access-control';
import { fetchAggregateProductMinors } from '../../../../../src/lib/scorecard/queries';
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
  const branchIds = searchParams.getAll('branch');
  const repCode = searchParams.get('rep') ?? undefined;
  const repField = (searchParams.get('repField') ?? 'rep_1') as 'rep_1' | 'rep_3';

  const params: AggregateParams = { branchIds, repCode, repField, baseYear, compareYear, period, cutoffDate };
  const minors = await fetchAggregateProductMinors(params, majorCode);
  return NextResponse.json({ minors });
}
