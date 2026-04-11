import { NextRequest, NextResponse } from 'next/server';
import { getErpSql } from '../../../../db/supabase';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_REQUESTS = 3;
const OTP_RATE_WINDOW_MINUTES = 15;

function generateCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(OTP_LENGTH, '0');
}

async function sendOtpEmail(to: string, code: string): Promise<{ ok: boolean; msg: string }> {
  const appName = process.env.OTP_APP_NAME ?? 'Beisser LiveEdge';

  // Dev: print to console (no email config required)
  if (process.env.AUTH_OTP_CONSOLE === 'true' || process.env.AUTH_OTP_CONSOLE === '1') {
    console.log(`\n${'='.repeat(40)}\nOTP for ${to}: ${code}\n${'='.repeat(40)}\n`);
    return { ok: true, msg: 'console' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[otp] RESEND_API_KEY not set. Set AUTH_OTP_CONSOLE=true for local dev.');
    return { ok: false, msg: 'Email delivery not configured.' };
  }

  const from = process.env.OTP_EMAIL_FROM ?? 'noreply@beisserlumber.com';
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#004526">${appName}</h2>
      <p>Use the code below to sign in. It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
      <div style="font-size:2.5rem;font-weight:bold;letter-spacing:0.35em;
                  background:#f4f4f4;padding:20px;text-align:center;
                  border-radius:8px;margin:24px 0;color:#004526">
        ${code}
      </div>
      <p style="color:#666;font-size:0.85rem">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `${appName} <${from}>`,
      to: [to],
      subject: `Your ${appName} sign-in code`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[otp] Resend error:', res.status, body);
    return { ok: false, msg: 'Failed to send sign-in email.' };
  }

  return { ok: true, msg: 'sent' };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = ((body?.email as string) ?? '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }

    console.log('[request-otp] step 1: connecting to DB for', email);
    const sql = getErpSql();

    console.log('[request-otp] step 2: querying app_users');
    // Look up user — vague response if not found (don't reveal whether email exists)
    const users = await sql`
      SELECT id FROM app_users
      WHERE email = ${email}
        AND is_active = true
      LIMIT 1
    `;
    console.log('[request-otp] step 3: user lookup done, found', users.length);

    if (users.length === 0) {
      // Deliberate no-op: return 200 so callers can't enumerate users
      return NextResponse.json({ ok: true });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - OTP_RATE_WINDOW_MINUTES * 60_000);

    // Rate-limit: max OTP_MAX_REQUESTS unused codes per rate window
    const [{ cnt }] = await sql<[{ cnt: number }]>`
      SELECT COUNT(*)::int AS cnt
      FROM otp_codes
      WHERE email = ${email}
        AND created_at >= ${windowStart}
        AND used = false
    `;

    if (cnt >= OTP_MAX_REQUESTS) {
      return NextResponse.json(
        { error: `Too many requests. Please wait ${OTP_RATE_WINDOW_MINUTES} minutes.` },
        { status: 429 }
      );
    }

    // Invalidate any previous unused codes for this email
    await sql`
      UPDATE otp_codes SET used = true
      WHERE email = ${email} AND used = false
    `;

    const code = generateCode();
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60_000);

    await sql`
      INSERT INTO otp_codes (email, code, created_at, expires_at, used)
      VALUES (${email}, ${code}, ${now}, ${expiresAt}, false)
    `;

    const { ok, msg } = await sendOtpEmail(email, code);
    if (!ok) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[request-otp]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
