import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { searchCustomers } from '../../../../src/lib/scorecard/queries';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
