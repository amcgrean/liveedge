import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { fetchOpenPickers } from '../../../../src/lib/warehouse-open-picks';

// GET /api/warehouse/open-picks?branch=
// Returns picks grouped by picker (from local pick + pickster tables)
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const pickers = await fetchOpenPickers();
    return NextResponse.json({ pickers });
  } catch (err) {
    console.error('[warehouse/open-picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
