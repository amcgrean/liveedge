import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { searchCustomers } from '../../../../src/lib/scorecard/queries';

export async function GET(req: NextRequest) {
  const authResult = await requireCapability('sales.view');
  if (authResult instanceof NextResponse) return authResult;

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.length < 1) return NextResponse.json({ customers: [] });

  try {
    const customers = await searchCustomers(q, 20);
    return NextResponse.json({ customers });
  } catch (err) {
    console.error('[scorecard/customers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
