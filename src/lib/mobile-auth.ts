/**
 * Mobile-app JWT auth — Bearer token sign/verify helpers.
 *
 * The web app uses NextAuth's cookie-based session; the Expo driver app can't
 * carry cookies cleanly, so it gets a dedicated JWT path. Tokens are signed
 * with the same AUTH_SECRET as NextAuth so we don't manage a second secret.
 *
 * Used by:
 *   - /api/auth/mobile/verify-otp (signs)
 *   - Dispatch routes that need Bearer fallback (verifies)
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '../../auth';
import { effectiveCapabilities, hasCapability, type Capability } from './access-control-shared';

const ISSUER = 'liveedge-mobile';
const AUDIENCE = 'liveedge-mobile-app';
const DEFAULT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days, seconds

export interface MobileTokenPayload extends JWTPayload {
  sub: string;
  name?: string;
  email?: string;
  roles: string[];
  branch: string | null;
  capabilities: string[];
}

export interface MobileSession {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    roles: string[];
    branch: string | null;
    capabilities: string[];
  };
  token: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? 'dev-only-auth-secret';
  return new TextEncoder().encode(secret);
}

export interface SignMobileTokenInput {
  userId: string;
  name?: string | null;
  email?: string | null;
  roles: string[];
  branch: string | null;
  capabilities: string[];
  expiresInSeconds?: number;
}

export async function signMobileToken(input: SignMobileTokenInput): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN;
  const token = await new SignJWT({
    name: input.name ?? undefined,
    email: input.email ?? undefined,
    roles: input.roles,
    branch: input.branch,
    capabilities: input.capabilities,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(getSecret());
  return { token, expiresIn };
}

export async function verifyMobileToken(token: string): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload.sub !== 'string') return null;
    return payload as MobileTokenPayload;
  } catch {
    return null;
  }
}

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, value] = header.split(/\s+/, 2);
  if (!value || scheme.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

/**
 * Read the Bearer token from the request and return a Session-shaped object
 * if it's valid. Returns null on missing/invalid token. Does NOT enforce
 * capabilities — callers handle that with hasCapability().
 */
export async function getMobileSession(req: NextRequest): Promise<Session | null> {
  const token = extractBearer(req);
  if (!token) return null;
  const payload = await verifyMobileToken(token);
  if (!payload) return null;

  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const grantedCapabilities = Array.isArray(payload.capabilities)
    ? payload.capabilities
    : Array.from(effectiveCapabilities(roles));

  // Shape it to look like a NextAuth Session so existing capability helpers
  // (hasCapability, etc.) work without branching.
  return {
    user: {
      id: payload.sub,
      name: (payload.name as string | undefined) ?? null,
      email: (payload.email as string | undefined) ?? null,
      image: null,
      role: roles[0] ?? 'viewer',
      roles,
      branch: payload.branch ?? null,
      branchId: null,
      agentId: null,
      capabilities: grantedCapabilities,
    },
    expires: new Date((payload.exp ?? 0) * 1000).toISOString(),
  } as Session;
}

/**
 * Capability guard that accepts EITHER a NextAuth cookie session OR a Bearer
 * JWT from the mobile app. Mirrors requireCapability() in access-control.ts
 * — returns the session on success or a NextResponse on failure that the
 * caller should immediately return.
 *
 * Use in dispatch route handlers that both web and mobile clients call.
 */
export async function requireSessionOrMobile(
  req: NextRequest,
  ...required: Capability[]
): Promise<Session | NextResponse> {
  let session: Session | null = await getMobileSession(req);
  if (!session) {
    session = await auth();
  }
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (required.length > 0 && !hasCapability(session, ...required)) {
    return NextResponse.json(
      { error: `Missing capability: ${required.join(' or ')}` },
      { status: 403 }
    );
  }
  return session;
}
