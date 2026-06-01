// GET /api/cron/sync-health-alert
// Runs once daily AFTER the ERP sync (06:00 UTC) and the rollup refreshes
// (09:10–09:20 UTC). Computes sync health; if the Pi sync or any analytics
// rollup is stale/failed, emails the addresses in SYNC_HEALTH_ALERT_TO.
//
// Dedupe by design: a single daily run means at most one alert per day while
// stale — no alert-state table needed. Auth via CRON_SECRET bearer.

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSignature } from '../../../../src/lib/service-auth';
import { computeSyncHealth } from '../../../../src/lib/admin/sync-health';
import { sendSyncAlertEmail, buildSyncAlertHtml } from '../../../../src/lib/email/send-sync-alert';

export const runtime = 'nodejs';

function recipients(): string[] {
  return (process.env.SYNC_HEALTH_ALERT_TO ?? '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const authError = verifyCronSignature(req);
  if (authError) return authError;

  // ?test=1 forces a sample alert send (even when healthy) so the email path can
  // be verified on demand without waiting for a real outage. Still auth-gated.
  const isTest = req.nextUrl.searchParams.get('test') === '1'
    || req.nextUrl.searchParams.get('test') === 'true';

  let health;
  try {
    health = await computeSyncHealth();
  } catch (err) {
    console.error('[sync-health-alert] compute failed', err);
    return NextResponse.json({ error: 'compute failed' }, { status: 500 });
  }

  if (health.healthy && !isTest) {
    return NextResponse.json({ healthy: true, alerted: false });
  }

  // Sample mode = a ?test=1 run against an ACTUALLY-HEALTHY system: inject a
  // synthetic issue so the email renders, and mark it [TEST]. If ?test=1 is run
  // while the sync is genuinely stale, this is NOT a sample — send the real
  // alert with no [TEST] prefix, so a true outage is never disguised as a test.
  const sampleMode = isTest && health.healthy;
  const healthForEmail = sampleMode
    ? { ...health, issues: ['[TEST] Sample alert — the sync is actually healthy. This confirms email delivery + rendering.'] }
    : health;

  // Always log (visible in Vercel logs even if email isn't configured).
  console.warn(`[sync-health-alert]${sampleMode ? ' (test)' : ' STALE:'} ${healthForEmail.issues.join(' | ')}`);

  const to = recipients();
  if (to.length === 0) {
    return NextResponse.json({
      healthy: health.healthy,
      alerted: false,
      reason: 'SYNC_HEALTH_ALERT_TO not configured',
      issues: healthForEmail.issues,
    });
  }

  const result = await sendSyncAlertEmail({
    to,
    subject: `${sampleMode ? '[TEST] ' : ''}⚠️ LiveEdge data sync stale — ${healthForEmail.issues.length} issue${healthForEmail.issues.length === 1 ? '' : 's'}`,
    html: buildSyncAlertHtml(healthForEmail),
  });

  if (!result.ok) {
    console.error('[sync-health-alert] email send failed', result.error);
  }

  return NextResponse.json({
    healthy: health.healthy,
    test: sampleMode,
    alerted: result.ok,
    consoleOnly: result.consoleOnly ?? false,
    recipients: to.length,
    issues: healthForEmail.issues,
    error: result.ok ? undefined : result.error,
  });
}
