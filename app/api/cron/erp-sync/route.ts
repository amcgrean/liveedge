import { NextRequest, NextResponse } from 'next/server';
import { runErpSync } from '../../../../src/lib/erp-sync';

// GET /api/cron/erp-sync
// Vercel Cron endpoint for scheduled ERP sync.
// Protected by CRON_SECRET bearer token (set in Vercel env vars).
// Schedule configured in vercel.json: every 4 hours
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    // Also accept Vercel's cron verification header
    const vercelCron = req.headers.get('x-vercel-cron');
    if (!vercelCron) {
      return NextResponse.json({ error: 'Missing CRON_SECRET or Vercel cron header' }, { status: 401 });
    }
  }

  try {
    const result = await runErpSync({});
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/erp-sync]', err);
    return NextResponse.json({
      error: 'Sync failed',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
