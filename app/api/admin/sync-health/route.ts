import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { computeSyncHealth } from '../../../../src/lib/admin/sync-health';

// GET /api/admin/sync-health
// Lightweight freshness monitor for the Pi → Supabase ERP sync and the analytics
// rollups (Tier 1 of the architecture review). All computation lives in
// src/lib/admin/sync-health.ts (shared with the daily alert cron); see that file
// for why each probe is cheap (indexed MAX / reltuples / cron.job_run_details).

export async function GET() {
  const authResult = await requireCapability('admin.config.manage');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const health = await computeSyncHealth();
    return NextResponse.json(health);
  } catch (err) {
    console.error('[admin/sync-health GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
