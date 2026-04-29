import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { fetchAggregateProductItems } from '../../../../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../../../../src/lib/scorecard/types';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const majorCode = searchParams.get('majorCode') ?? '';
  const minorCode = searchParams.get('minorCode') ?? '';
  const baseYear = parseInt(searchParams.get('baseYear') ?? String(new Date().getFullYear()), 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? String(baseYear - 1), 10);
  const period = (searchParams.get('period') ?? 'YTD') as AggregateParams['period'];
  const cutoffDate = searchParams.get('cutoffDate') ?? new Date().toISOString().slice(0, 10);
  const branchIds = searchParams.getAll('branch');
  const repCode = searchParams.get('rep') ?? undefined;
  const repField = (searchParams.get('repField') ?? 'rep_1') as 'rep_1' | 'rep_3';

  const params: AggregateParams = { branchIds, repCode, repField, baseYear, compareYear, period, cutoffDate };

  try {
    const items = await fetchAggregateProductItems(params, majorCode, minorCode);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[scorecard/aggregate/items GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
