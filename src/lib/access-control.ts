/**
 * Capability-based access control — server-side guards.
 *
 * Pure helpers (CAPABILITIES, ROLE_DEFAULTS, effectiveCapabilities,
 * hasCapability, …) live in access-control-shared.ts so client components
 * can import them without pulling in the postgres driver via auth.ts.
 *
 * Server components and API routes should import from this file (which
 * re-exports everything) or directly from access-control-shared.ts.
 */

// Re-export the full shared vocabulary so existing callers don't break.
export * from './access-control-shared';

import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '../../auth';
import { hasCapability } from './access-control-shared';
import type { Capability } from './access-control-shared';

// ─── Server-side guards ───────────────────────────────────────────────────────

/**
 * API-route guard. Returns the session if the user holds any of the
 * requested capabilities; otherwise returns a 401 or 403 NextResponse
 * the caller should immediately return.
 *
 *   const auth = await requireCapability('picks.release');
 *   if (auth instanceof NextResponse) return auth;
 *   const { user } = auth;
 */
export async function requireCapability(
  ...required: Capability[]
): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasCapability(session, ...required)) {
    return NextResponse.json(
      { error: `Missing capability: ${required.join(' or ')}` },
      { status: 403 }
    );
  }
  return session;
}

/**
 * Server-component / page guard. Redirects to `/login` if unauthenticated
 * or `/` if the user is signed in but lacks every requested capability.
 *
 *   export default async function Page() {
 *     await requirePageAccess('admin.audit.view');
 *     // … render
 *   }
 */
export async function requirePageAccess(
  ...required: Capability[]
): Promise<Session> {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!hasCapability(session, ...required)) redirect('/');
  return session;
}
