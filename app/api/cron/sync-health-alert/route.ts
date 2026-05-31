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

  let health;
  try {
    health = await computeSyncHealth();
  } catch (err) {
    console.error('[sync-health-alert] compute failed', err);
    return NextResponse.json({ error: 'compute failed' }, { status: 500 });
  }

  if (health.healthy) {
    return NextResponse.json({ healthy: true, alerted: false });
  }

  // Stale: always log (visible in Vercel logs even if email isn't configured).
  console.warn(`[sync-health-alert] STALE: ${health.issues.join(' | ')}`);

  const to = recipients();
  if (to.length === 0) {
    return NextResponse.json({
      healthy: false,
      alerted: false,
      reason: 'SYNC_HEALTH_ALERT_TO not configured',
      issues: health.issues,
    });
  }

  const result = await sendSyncAlertEmail({
    to,
    subject: `⚠️ LiveEdge data sync stale — ${health.issues.length} issue${health.issues.length === 1 ? '' : 's'}`,
    html: buildSyncAlertHtml(health),
  });

  if (!result.ok) {
    console.error('[sync-health-alert] email send failed', result.error);
  }

  return NextResponse.json({
    healthy: false,
    alerted: result.ok,
    consoleOnly: result.consoleOnly ?? false,
    recipients: to.length,
    issues: health.issues,
    error: result.ok ? undefined : result.error,
  });
}
