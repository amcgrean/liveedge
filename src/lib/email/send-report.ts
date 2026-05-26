// Minimal Resend wrapper for report attachments. Reuses the raw-fetch
// pattern already in use by OTP / notifications / it-issues; consolidating
// those callers into this module is out of scope for this PR.

export interface ReportEmailAttachment {
  filename:    string;
  contentBase64: string;
  contentType: string;
}

export interface SendReportEmailInput {
  to:          string;
  subject:     string;
  html:        string;
  attachment:  ReportEmailAttachment;
}

export interface SendReportEmailResult {
  ok:        boolean;
  messageId: string | null;
  error:     string | null;
}

const FROM_ADDRESS = process.env.REPORTS_EMAIL_FROM ?? 'LiveEdge Reports <noreply@app.beisser.cloud>';

export async function sendReportEmail(input: SendReportEmailInput): Promise<SendReportEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  // Dev fallthrough — log instead of sending so subscribe flows are testable
  // without a Resend key in local environments.
  if (!apiKey) {
    if (process.env.REPORTS_EMAIL_CONSOLE === 'true' || process.env.REPORTS_EMAIL_CONSOLE === '1') {
      console.log(`\n[send-report] (dev) Would send to=${input.to} subject=${input.subject} attachment=${input.attachment.filename}\n`);
      return { ok: true, messageId: 'console', error: null };
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
        attachments: [
          {
            filename: input.attachment.filename,
            // Resend accepts base64 content via { filename, content } where
            // content is a base64 string for binary attachments.
            content:  input.attachment.contentBase64,
          },
        ],
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

/**
 * Standard branded HTML body for a report email. Renders a header strip,
 * a short paragraph, KPI highlights (optional), and a footer with an
 * unsubscribe link.
 */
export function buildReportEmailHtml(args: {
  reportLabel:    string;
  cadenceLabel:   string;
  paramsSummary:  string;
  rangeLabel:     string;
  highlights?:    Array<{ label: string; value: string }>;
  unsubscribeUrl: string;
  manageUrl:      string;
}): string {
  const highlightsHtml = (args.highlights ?? []).map((h) => `
    <td style="padding:12px;background:#0f172a;border-radius:6px">
      <p style="margin:0;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px">${escapeHtml(h.label)}</p>
      <p style="margin:4px 0 0;color:#f1f5f9;font-size:18px;font-weight:600">${escapeHtml(h.value)}</p>
    </td>
  `).join('<td style="width:8px"></td>');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="background:#006834;border-radius:8px 8px 0 0;padding:20px 24px">
          <p style="margin:0;color:#bbf7d0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Beisser LiveEdge · ${escapeHtml(args.cadenceLabel)}</p>
          <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700">${escapeHtml(args.reportLabel)}</h1>
          <p style="margin:4px 0 0;color:#bbf7d0;font-size:13px">${escapeHtml(args.rangeLabel)} · ${escapeHtml(args.paramsSummary)}</p>
        </td></tr>
        <tr><td style="background:#1e293b;border-radius:0 0 8px 8px;padding:24px;color:#cbd5e1;font-size:14px;line-height:1.5">
          <p style="margin:0 0 16px">Your scheduled report is attached.</p>
          ${highlightsHtml ? `<table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px"><tr>${highlightsHtml}</tr></table>` : ''}
          <p style="margin:0;color:#64748b;font-size:12px">Open the attachment for the full report.</p>
        </td></tr>
        <tr><td style="padding:16px 0 0;text-align:center">
          <p style="margin:0;color:#475569;font-size:11px">
            <a href="${escapeAttr(args.manageUrl)}" style="color:#64748b;text-decoration:underline">Manage subscriptions</a>
            &nbsp;·&nbsp;
            <a href="${escapeAttr(args.unsubscribeUrl)}" style="color:#64748b;text-decoration:underline">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
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

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
