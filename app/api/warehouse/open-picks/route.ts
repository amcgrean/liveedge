import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { fetchOpenPickers } from '../../../../src/lib/warehouse-open-picks';

// GET /api/warehouse/open-picks?branch=
// Returns picks grouped by picker (from local pick + pickster tables)
export async function GET() {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const pickers = await fetchOpenPickers();
    return NextResponse.json({ pickers });
  } catch (err) {
    console.error('[warehouse/open-picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
