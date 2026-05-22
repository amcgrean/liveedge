import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import {
  fetchDeliveryReport,
  type DeliveryReportRow,
  type DailyBranchCell,
  type DeliveryReportPayload,
} from '../../../../src/lib/ops/delivery-reporting-query';

export type { DeliveryReportRow, DailyBranchCell, DeliveryReportPayload };

// GET /api/ops/delivery-reporting?sale_type=all&window=30d&branch=
//
// Fulfilled deliveries (excludes will-calls, directs, install-only, hold) over
// a rolling window. Returns per-day-per-branch counts so the client can compute
// daily averages, highs, and lows — the metrics ops actually cares about.
// Saturday inclusion is a client-side toggle since most metrics differ
// dramatically when Saturdays are mixed in (low-volume delivery days).
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('dispatch.manage');
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = req.nextUrl;
  const saleTypeParam = searchParams.get('sale_type') ?? 'all';
  const windowRaw = searchParams.get('window') ?? '30d';
  const windowParam: '7d' | '30d' | '90d' = windowRaw === '7d' ? '7d' : windowRaw === '90d' ? '90d' : '30d';
  const branchParam = searchParams.get('branch') ?? '';
  const dateParam = searchParams.get('date') ?? '';
  const detailLimit = parseInt(searchParams.get('detail_limit') ?? '250', 10) || 250;

  try {
    const payload = await fetchDeliveryReport({
      windowParam,
      saleTypeParam,
      branchParam,
      dateParam,
      detailLimit,
    });
    const res = NextResponse.json(payload);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    return res;
  } catch (err) {
    console.error('[ops/delivery-reporting GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
