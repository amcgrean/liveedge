import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { searchErpItems } from '../../../../src/lib/erp-sync';
import { isErpConfigured } from '../../../../db/supabase';

/**
 * GET /api/erp/items?q=2x4&branchCode=DM&stockOnly=true&limit=50&offset=0
 *
 * Search ERP items with optional branch filter and stock-only flag.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isErpConfigured()) {
    return NextResponse.json({ error: 'ERP database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const branchCode = searchParams.get('branchCode') ?? undefined;
  const stockOnly = searchParams.get('stockOnly') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const result = await searchErpItems({ q, branchCode, stockOnly, limit, offset });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[erp/items]', err);
    return NextResponse.json({
      error: 'Query failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
