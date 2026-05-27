// Minimal Twilio SMS wrapper. Raw fetch (no SDK) to match the pattern used
// by the Resend wrappers (src/lib/email/send-report.ts, send-otp).
//
// Env vars:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER         E.164 sender, e.g. '+15155550123'
//   DISPATCH_ALERTS_CONSOLE    when 'true', log instead of sending (dev parity
//                              with AUTH_OTP_CONSOLE / REPORTS_EMAIL_CONSOLE)

export interface SendSmsInput {
  to:   string; // E.164
  body: string;
}

export interface SendSmsResult {
  ok:        boolean;
  messageId: string | null;
  error:     string | null;
  consoleOnly?: boolean;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const consoleMode =
    process.env.DISPATCH_ALERTS_CONSOLE === 'true' ||
    process.env.DISPATCH_ALERTS_CONSOLE === '1';

  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;

  if (consoleMode || !sid || !token || !from) {
    if (consoleMode) {
      console.log(`\n[send-sms] (dev) to=${input.to} body=${JSON.stringify(input.body)}\n`);
      return { ok: true, messageId: null, error: null, consoleOnly: true };
    }
    return { ok: false, messageId: null, error: 'Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER missing)' };
  }

  try {
    const params = new URLSearchParams({ To: input.to, From: from, Body: input.body });
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, messageId: null, error: `Twilio ${res.status}: ${body}` };
    }

    const json = await res.json() as { sid?: string };
    return { ok: true, messageId: json.sid ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      messageId: null,
      error: err instanceof Error ? err.message : 'Unknown Twilio error',
    };
  }
}
