import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { effectiveCapabilities } from '../../../../../src/lib/access-control-shared';
import { signMobileToken } from '../../../../../src/lib/mobile-auth';

/**
 * POST /api/auth/mobile/verify-otp
 *
 * Mobile-only counterpart to the NextAuth credentials flow. Validates the
 * OTP code from `otp_codes`, marks it used, and returns a JWT + user payload.
 *
 * Body:
 *   { identifier: string, code: string }
 * Response:
 *   { user: {...}, token: string, expiresIn: number }   // 200
 *   { error: string }                                   // 400 / 401 / 500
 */

function getSql() {
  const url =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL_UNPOOLED ||
    process.env.BIDS_DATABASE_URL;
  if (!url) throw new Error('No database URL configured');
  return postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 8, prepare: false });
}

export async function POST(req: NextRequest) {
  let body: { identifier?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const identifier = (body.identifier ?? '').trim().toLowerCase();
  const code = (body.code ?? '').trim();
  if (!identifier || !code) {
    return NextResponse.json(
      { error: 'identifier and code are required' },
      { status: 400 }
    );
  }

  try {
    const sql = getSql();
    const isEmail = identifier.includes('@');

    const userRows = await sql<{
      id: number;
      email: string;
      display_name: string | null;
      roles: string[] | null;
      branch: string | null;
      granted_capabilities: string[] | null;
      revoked_capabilities: string[] | null;
    }[]>`
      SELECT id, email, display_name, roles, branch,
             COALESCE(granted_capabilities, '{}') AS granted_capabilities,
             COALESCE(revoked_capabilities, '{}') AS revoked_capabilities
      FROM app_users
      WHERE ${isEmail ? sql`email = ${identifier}` : sql`username = ${identifier}`}
        AND is_active = true
      LIMIT 1
    `;

    if (userRows.length === 0) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }
    const user = userRows[0];

    const otpRows = await sql<{ id: number; code: string }[]>`
      SELECT id, code
      FROM otp_codes
      WHERE email = ${user.email}
        AND used = false
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (otpRows.length === 0 || otpRows[0].code !== code) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    await sql`UPDATE otp_codes SET used = true WHERE id = ${otpRows[0].id}`;
    sql`UPDATE app_users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

    const roles: string[] = Array.isArray(user.roles) ? user.roles : [];
    const granted = Array.isArray(user.granted_capabilities) ? user.granted_capabilities : [];
    const revoked = Array.isArray(user.revoked_capabilities) ? user.revoked_capabilities : [];
    const capabilities = Array.from(effectiveCapabilities(roles, granted, revoked));

    const { token, expiresIn } = await signMobileToken({
      userId: String(user.id),
      name: user.display_name,
      email: user.email,
      roles,
      branch: user.branch,
      capabilities,
    });

    return NextResponse.json({
      user: {
        id: String(user.id),
        username: isEmail ? user.email.split('@')[0] : identifier,
        email: user.email,
        name: user.display_name ?? identifier,
        roles,
        branch: user.branch,
        capabilities,
      },
      token,
      expiresIn,
    });
  } catch (err) {
    console.error('[mobile/verify-otp]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
