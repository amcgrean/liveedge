import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { runErpSync } from '../../../../../src/lib/erp-sync';

/**
 * POST /api/admin/erp/sync
 *
 * Manually trigger an ERP sync from the admin UI.
 * Admin-only. Runs the same logic as the cron endpoint.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { tables?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  try {
    const result = await runErpSync({ tables: body.tables });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[erp/sync]', err);
    return NextResponse.json({
      error: 'Sync failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
