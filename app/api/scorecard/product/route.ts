import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { fetchProductScorecardMajors } from '../../../../src/lib/scorecard/queries';
import type { AggregateParams } from '../../../../src/lib/scorecard/types';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const baseYear = parseInt(searchParams.get('baseYear') ?? String(new Date().getFullYear()), 10);
  const compareYear = parseInt(searchParams.get('compareYear') ?? String(baseYear - 1), 10);
  const period = (searchParams.get('period') ?? 'YTD') as AggregateParams['period'];
  const cutoffDate = searchParams.get('cutoffDate') ?? new Date().toISOString().slice(0, 10);
  const branchIds = searchParams.getAll('branch').filter(Boolean);

  try {
    const majors = await fetchProductScorecardMajors({ branchIds, baseYear, compareYear, period, cutoffDate });
    return NextResponse.json({ majors });
  } catch (err) {
    console.error('[scorecard/product GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
