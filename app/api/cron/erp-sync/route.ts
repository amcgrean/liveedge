import { NextRequest, NextResponse } from 'next/server';
import { runErpSync } from '../../../../src/lib/erp-sync';
import { verifyCronSignature } from '../../../../src/lib/service-auth';

// GET /api/cron/erp-sync
// Vercel Cron endpoint for scheduled ERP sync.
// Protected by CRON_SECRET bearer token (set in Vercel env vars).
// Schedule configured in vercel.json: every 4 hours
export async function GET(req: NextRequest) {
  const authError = verifyCronSignature(req);
  if (authError) return authError;

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
