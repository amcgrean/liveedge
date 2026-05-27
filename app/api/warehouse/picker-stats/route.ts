import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { fetchPickerStats } from '../../../../src/lib/warehouse/picker-stats-query';

// GET /api/warehouse/picker-stats?days=30
// Returns aggregate pick performance per picker.
// Response is cached server-side for 5 minutes (erpCache inside fetchPickerStats).
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('pickers.manage', 'yard.view');
  if (authResult instanceof NextResponse) return authResult;

  const days = Math.max(1, Math.min(365, parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30));

  try {
    const payload = await fetchPickerStats(days);
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[warehouse/picker-stats GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
