// Thin Resend wrapper for the daily sync-health staleness alert. Plain
// transactional email; mirrors the raw-fetch shape of send-dispatch-alert.

import type { SyncHealth } from '../admin/sync-health';

export interface SendSyncAlertResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
  consoleOnly?: boolean;
}

const FROM_ADDRESS =
  process.env.SYNC_ALERTS_EMAIL_FROM ??
  'LiveEdge Ops <noreply@app.beisser.cloud>';

export async function sendSyncAlertEmail(args: {
  to: string[];
  subject: string;
  html: string;
}): Promise<SendSyncAlertResult> {
  const consoleMode =
    process.env.SYNC_ALERTS_CONSOLE === 'true' || process.env.SYNC_ALERTS_CONSOLE === '1';
  const apiKey = process.env.RESEND_API_KEY;

  if (consoleMode || !apiKey) {
    if (consoleMode) {
      console.log(`\n[sync-alert] (dev) to=${args.to.join(',')} subject=${JSON.stringify(args.subject)}\n`);
      return { ok: true, messageId: null, error: null, consoleOnly: true };
    }
    return { ok: false, messageId: null, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_ADDRESS, to: args.to, subject: args.subject, html: args.html }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, messageId: null, error: `Resend ${res.status}: ${body}` };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, messageId: json.id ?? null, error: null };
  } catch (err) {
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : 'Unknown send error' };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

export function buildSyncAlertHtml(health: SyncHealth): string {
  const issueItems = health.issues
    .map(
      (i) =>
        `<li style="margin:4px 0;color:#fde68a;font-size:14px;line-height:1.5">${escapeHtml(i)}</li>`,
    )
    .join('\n');

  const factAge = health.scorecardFact.ageHours;
  const factLine = `customer_scorecard_fact: last sync ${factAge === null ? 'unknown' : `${factAge}h ago`}`;
  const rollupLines = health.rollups
    .map((r) => {
      const age = r.ageHours === null ? 'unknown' : `${r.ageHours}h ago`;
      const status = r.lastRefreshStatus ?? '—';
      return `<tr>
        <td style="padding:6px 8px;border-top:1px solid #334155;color:#e2e8f0;font-size:13px;white-space:nowrap">${escapeHtml(r.name)}</td>
        <td style="padding:6px 8px;border-top:1px solid #334155;color:${r.stale ? '#fca5a5' : '#86efac'};font-size:13px">${escapeHtml(age)}</td>
        <td style="padding:6px 8px;border-top:1px solid #334155;color:#94a3b8;font-size:13px">${escapeHtml(status)}</td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
      <tr><td style="background:#92400e;border-radius:8px 8px 0 0;padding:20px 24px">
        <p style="margin:0;color:#fde68a;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Beisser LiveEdge · Ops</p>
        <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700">⚠️ Data sync is stale</h1>
        <p style="margin:4px 0 0;color:#fde68a;font-size:13px">The ERP sync or an analytics rollup hasn't refreshed on schedule.</p>
      </td></tr>
      <tr><td style="background:#1e293b;padding:20px 24px">
        <p style="margin:0 0 8px;color:#cbd5e1;font-size:13px;font-weight:600">Issues</p>
        <ul style="margin:0;padding-left:18px">${issueItems}</ul>
      </td></tr>
      <tr><td style="background:#1e293b;padding:8px 24px 20px;border-top:1px solid #334155">
        <p style="margin:8px 0;color:#94a3b8;font-size:13px">${escapeHtml(factLine)}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Rollup</td>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Last refresh</td>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Status</td>
          </tr>
${rollupLines}
        </table>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 8px 8px;padding:12px 24px 20px;border-top:1px solid #334155">
        <p style="margin:0;color:#94a3b8;font-size:12px">Likely cause: the Raspberry Pi sync worker or a pg_cron refresh job. Check the Pi systemd timer and <code style="color:#cbd5e1">/api/admin/sync-health</code>. Generated ${escapeHtml(health.generatedAt)}.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
