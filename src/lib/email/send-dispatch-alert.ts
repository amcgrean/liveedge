// Thin Resend wrapper for dispatch route-completion alerts. Plain transactional
// email — no PDF attachment, no subscription log. Mirrors the raw-fetch shape
// used by send-otp and send-report.

export interface SendDispatchAlertInput {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

export interface SendDispatchAlertResult {
  ok:        boolean;
  messageId: string | null;
  error:     string | null;
  consoleOnly?: boolean;
}

const FROM_ADDRESS =
  process.env.DISPATCH_ALERTS_EMAIL_FROM ??
  'LiveEdge Dispatch <noreply@app.beisser.cloud>';

export async function sendDispatchAlertEmail(
  input: SendDispatchAlertInput,
): Promise<SendDispatchAlertResult> {
  const consoleMode =
    process.env.DISPATCH_ALERTS_CONSOLE === 'true' ||
    process.env.DISPATCH_ALERTS_CONSOLE === '1';
  const apiKey = process.env.RESEND_API_KEY;

  if (consoleMode || !apiKey) {
    if (consoleMode) {
      console.log(`\n[dispatch-alert] (dev) to=${input.to} subject=${JSON.stringify(input.subject)}\n`);
      return { ok: true, messageId: null, error: null, consoleOnly: true };
    }
    return { ok: false, messageId: null, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_ADDRESS,
        to:      [input.to],
        subject: input.subject,
        html:    input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, messageId: null, error: `Resend ${res.status}: ${body}` };
    }
    const json = await res.json() as { id?: string };
    return { ok: true, messageId: json.id ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      messageId: null,
      error: err instanceof Error ? err.message : 'Unknown send error',
    };
  }
}

// One delivery/return stop on a completed route. Mirrors the `stops[]` entries
// the Pi reconciler now posts to /api/dispatch/agility-route-complete.
export interface DispatchAlertStop {
  soId:     string;
  saleType: string;
  customer: string;
  address1: string;
  city:     string;
  state:    string;
  zip:      string;
}

function isCreditStop(s: DispatchAlertStop): boolean {
  return s.saleType.trim().toLowerCase() === 'credit';
}

// "212 NE Westgate Drive · Waukee, IA 50263" — gracefully drops missing pieces
// so we never leave a stray comma or leading dot.
function formatStopAddress(s: DispatchAlertStop): string {
  const cityStateZip = [
    s.city.trim(),
    [s.state.trim(), s.zip.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return [s.address1.trim(), cityStateZip].filter(Boolean).join(' · ');
}

function renderStopsTable(stops: DispatchAlertStop[]): string {
  const rows = stops
    .map((s) => {
      const addr = formatStopAddress(s);
      return `          <tr>
            <td style="padding:6px 8px;border-top:1px solid #334155;color:#e2e8f0;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(s.soId)}</td>
            <td style="padding:6px 8px;border-top:1px solid #334155;color:#e2e8f0;font-size:13px;vertical-align:top">${escapeHtml(s.customer) || '—'}</td>
            <td style="padding:6px 8px;border-top:1px solid #334155;color:#94a3b8;font-size:13px;vertical-align:top">${escapeHtml(addr) || '—'}</td>
          </tr>`;
    })
    .join('\n');
  return `        <table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;border-collapse:collapse">
          <tr>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">SO</td>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Customer</td>
            <td style="padding:4px 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Address</td>
          </tr>
${rows}
        </table>`;
}

export function buildDispatchAlertHtml(args: {
  driverName:    string;
  routeName:     string;
  routeDateLabel:string;
  branchCode:    string;
  truckId:       string | null;
  completedSo:   string | null;
  stopCount:     number;
  completedAt:   string; // pre-formatted local time
  stops?:        DispatchAlertStop[];
}): string {
  const truckLine = args.truckId ? `<p style="margin:4px 0;color:#cbd5e1"><strong>Truck:</strong> ${escapeHtml(args.truckId)}</p>` : '';

  const hasStops   = Array.isArray(args.stops) && args.stops.length > 0;
  const deliveries = hasStops ? args.stops!.filter((s) => !isCreditStop(s)) : [];
  const credits    = hasStops ? args.stops!.filter((s) =>  isCreditStop(s)) : [];

  // When we have enriched stops, the deliveries table is more useful than the
  // first-5 SO list, so drop the "Final SO" line in that case.
  const soLine = (!hasStops && args.completedSo)
    ? `<p style="margin:4px 0;color:#cbd5e1"><strong>Final SO:</strong> ${escapeHtml(args.completedSo)}</p>`
    : '';

  const deliveriesBlock = deliveries.length > 0
    ? `        <tr><td style="background:#1e293b;padding:16px 24px;border-top:1px solid #334155">
          <p style="margin:0 0 4px;color:#bbf7d0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Deliveries (${deliveries.length})</p>
${renderStopsTable(deliveries)}
        </td></tr>`
    : '';

  const creditsBlock = credits.length > 0
    ? `        <tr><td style="background:#1e293b;padding:16px 24px;border-top:1px solid #334155">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#3a2410;border-left:4px solid #92400e;border-radius:4px">
            <tr><td style="padding:12px 14px">
              <p style="margin:0;color:#fcd34d;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">⚠️ Anticipated returns (${credits.length})</p>
              <p style="margin:4px 0 0;color:#fde68a;font-size:12px;line-height:1.4">These customers are sending product back — expect inbound material on this load.</p>
${renderStopsTable(credits)}
            </td></tr>
          </table>
        </td></tr>`
    : '';

  const isLastBodyBlock = !deliveriesBlock && !creditsBlock;
  const headerCardRadius = isLastBodyBlock ? '0 0 8px 8px' : '0';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="background:#006834;border-radius:8px 8px 0 0;padding:20px 24px">
          <p style="margin:0;color:#bbf7d0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Beisser LiveEdge · ${escapeHtml(args.branchCode)}</p>
          <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700">Route complete</h1>
          <p style="margin:4px 0 0;color:#bbf7d0;font-size:13px">${escapeHtml(args.driverName)} just finished — prep the next load.</p>
        </td></tr>
        <tr><td style="background:#1e293b;border-radius:${headerCardRadius};padding:20px 24px;color:#cbd5e1;font-size:14px;line-height:1.5">
          <p style="margin:4px 0"><strong>Driver:</strong> ${escapeHtml(args.driverName)}</p>
          <p style="margin:4px 0"><strong>Route:</strong> ${escapeHtml(args.routeName)} · ${escapeHtml(args.routeDateLabel)}</p>
          ${truckLine}
          ${soLine}
          <p style="margin:4px 0"><strong>Stops delivered:</strong> ${args.stopCount}</p>
        </td></tr>
${deliveriesBlock}
${creditsBlock}
        <tr><td style="background:#1e293b;border-radius:0 0 8px 8px;padding:12px 24px 20px;border-top:1px solid #334155">
          <p style="margin:0;color:#94a3b8;font-size:12px">Completed at ${escapeHtml(args.completedAt)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildDispatchAlertSmsBody(args: {
  driverName:  string;
  routeName:   string;
  branchCode:  string;
  truckId:     string | null;
  stopCount:   number;
  creditCount?: number;
}): string {
  const truck   = args.truckId ? ` · ${args.truckId}` : '';
  const credits = args.creditCount && args.creditCount > 0 ? ` · ${args.creditCount} credit${args.creditCount === 1 ? '' : 's'}` : '';
  return `LiveEdge: ${args.driverName} finished ${args.routeName} (${args.branchCode}${truck}) — ${args.stopCount} stops${credits}. Prep next load.`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default:  return '&#39;';
    }
  });
}
