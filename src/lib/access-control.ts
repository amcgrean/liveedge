/**
 * Capability-based access control.
 *
 * Roles (admin, sales, supervisor, …) are coarse presets. Each role implies
 * a default set of capabilities. Per-user grants and revokes (stored on
 * `public.app_users.granted_capabilities` / `.revoked_capabilities`) layer
 * on top so admins can fine-tune access without inventing new role types.
 *
 * Effective set = (∪ ROLE_DEFAULTS[role] for role in roles) ∪ granted − revoked
 *
 * Capabilities are computed once at login and persisted on the JWT for the
 * session lifetime (7 days). An admin permission change therefore takes
 * effect on the user's next sign-in.
 *
 * Phase 1 (this file): definitions + helpers. Existing role checks still
 * run in routes/pages; nothing yet calls these helpers in production code.
 * Phases 2-4 wire the admin UI, then sweep callers.
 */

import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from '../../auth';

// ─── Capability vocabulary ───────────────────────────────────────────────────
// Keep this list deliberately small. Each entry should map to either a real
// restriction point in the codebase or a planned one. Update CLAUDE.md when
// you add or remove capabilities.

export const CAPABILITIES = {
  // Operations / Yard
  PICKS_RELEASE:        'picks.release',
  PICKERS_MANAGE:       'pickers.manage',
  WORKORDERS_ASSIGN:    'workorders.assign',
  YARD_VIEW:            'yard.view',

  // Dispatch
  DISPATCH_VIEW:        'dispatch.view',
  DISPATCH_MANAGE:      'dispatch.manage',

  // Sales / Orders
  SALES_VIEW:           'sales.view',
  CUSTOMERS_NOTES_WRITE:'customers.notes.write',
  ORDERS_PUSH_TO_ERP:   'orders.push_to_erp',
  QUOTES_MANAGE:        'quotes.manage',

  // Estimating / Services
  BIDS_MANAGE:          'bids.manage',
  DESIGNS_MANAGE:       'designs.manage',
  EWP_MANAGE:           'ewp.manage',
  PROJECTS_MANAGE:      'projects.manage',

  // Purchasing
  PURCHASING_VIEW:      'purchasing.view',
  PURCHASING_RECEIVE:   'purchasing.receive',
  PURCHASING_REVIEW:    'purchasing.review',

  // Credits / Accounting
  CREDITS_VIEW:         'credits.view',
  CREDITS_MANAGE:       'credits.manage',
  AR_VIEW:              'ar.view',

  // Admin / System
  ADMIN_USERS_MANAGE:   'admin.users.manage',
  ADMIN_AUDIT_VIEW:     'admin.audit.view',
  ADMIN_CONFIG_MANAGE:  'admin.config.manage',
  ADMIN_JOBS_REVIEW:    'admin.jobs.review',
  ADMIN_PRODUCTS_VIEW:  'admin.products.view',
  ADMIN_CUSTOMERS_VIEW: 'admin.customers.view',
  HUBBELL_REVIEW:       'hubbell.review',

  // Cross-cutting
  BRANCH_ALL:           'branch.all',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

/** Every defined capability code, as a Set, for O(1) validation. */
export const ALL_CAPABILITIES: ReadonlySet<Capability> = new Set(
  Object.values(CAPABILITIES) as Capability[]
);

// ─── Role → default capabilities ─────────────────────────────────────────────
// Mirrors the hardcoded role lists found in current API routes and layouts.
// When sweeping callers in Phase 4, verify the defaults below match the role
// lists you're replacing — don't broaden access without intent.

const ALL: readonly Capability[] = Object.values(CAPABILITIES) as Capability[];

export const ROLE_DEFAULTS: Record<string, readonly Capability[]> = {
  admin: ALL,

  management: [
    CAPABILITIES.SALES_VIEW,
    CAPABILITIES.AR_VIEW,
    CAPABILITIES.ADMIN_AUDIT_VIEW,
    CAPABILITIES.ADMIN_JOBS_REVIEW,
    CAPABILITIES.ADMIN_PRODUCTS_VIEW,
    CAPABILITIES.ADMIN_CUSTOMERS_VIEW,
    CAPABILITIES.BRANCH_ALL,
  ],

  sales: [
    CAPABILITIES.SALES_VIEW,
    CAPABILITIES.CUSTOMERS_NOTES_WRITE,
    CAPABILITIES.ORDERS_PUSH_TO_ERP,
    CAPABILITIES.QUOTES_MANAGE,
    CAPABILITIES.CREDITS_VIEW,
  ],

  supervisor: [
    CAPABILITIES.SALES_VIEW,
    CAPABILITIES.YARD_VIEW,
    CAPABILITIES.PICKS_RELEASE,
    CAPABILITIES.PICKERS_MANAGE,
    CAPABILITIES.WORKORDERS_ASSIGN,
    CAPABILITIES.DISPATCH_VIEW,
    CAPABILITIES.DISPATCH_MANAGE,
  ],

  ops: [
    CAPABILITIES.SALES_VIEW,
    CAPABILITIES.YARD_VIEW,
    CAPABILITIES.PICKS_RELEASE,
    CAPABILITIES.WORKORDERS_ASSIGN,
    CAPABILITIES.DISPATCH_VIEW,
    CAPABILITIES.DISPATCH_MANAGE,
    CAPABILITIES.PURCHASING_VIEW,
    CAPABILITIES.BRANCH_ALL,
  ],

  warehouse: [
    CAPABILITIES.YARD_VIEW,
    CAPABILITIES.PICKS_RELEASE,
    CAPABILITIES.WORKORDERS_ASSIGN,
  ],

  dispatch: [
    CAPABILITIES.DISPATCH_VIEW,
    CAPABILITIES.DISPATCH_MANAGE,
    CAPABILITIES.YARD_VIEW,
    CAPABILITIES.PICKS_RELEASE,
  ],

  driver: [
    CAPABILITIES.DISPATCH_VIEW,
  ],

  estimator: [
    CAPABILITIES.BIDS_MANAGE,
    CAPABILITIES.DESIGNS_MANAGE,
    CAPABILITIES.EWP_MANAGE,
    CAPABILITIES.PROJECTS_MANAGE,
  ],

  estimating: [
    CAPABILITIES.BIDS_MANAGE,
    CAPABILITIES.DESIGNS_MANAGE,
    CAPABILITIES.EWP_MANAGE,
    CAPABILITIES.PROJECTS_MANAGE,
  ],

  designer: [
    CAPABILITIES.DESIGNS_MANAGE,
    CAPABILITIES.EWP_MANAGE,
  ],

  purchasing: [
    CAPABILITIES.PURCHASING_VIEW,
    CAPABILITIES.PURCHASING_RECEIVE,
    CAPABILITIES.PURCHASING_REVIEW,
  ],

  receiving_yard: [
    CAPABILITIES.PURCHASING_RECEIVE,
  ],

  hubbell: [
    CAPABILITIES.HUBBELL_REVIEW,
  ],

  viewer: [
    CAPABILITIES.SALES_VIEW,
  ],
};

// ─── Computation ─────────────────────────────────────────────────────────────

/**
 * Compute the effective capability set for a user.
 * Used by `auth.ts` at login and by tests; not normally called from request code
 * (use `hasCapability(session, ...)` instead, which reads the precomputed set).
 */
export function effectiveCapabilities(
  roles: readonly string[],
  granted: readonly string[] = [],
  revoked: readonly string[] = []
): Set<Capability> {
  const set = new Set<Capability>();
  for (const role of roles) {
    const defaults = ROLE_DEFAULTS[role];
    if (defaults) for (const cap of defaults) set.add(cap);
  }
  for (const cap of granted) {
    if (ALL_CAPABILITIES.has(cap as Capability)) set.add(cap as Capability);
  }
  for (const cap of revoked) {
    set.delete(cap as Capability);
  }
  return set;
}

// ─── Session-level helpers ───────────────────────────────────────────────────

type SessionWithCaps = Session & {
  user: Session['user'] & { capabilities?: string[] };
};

/** Read the capability set off a session. Empty set when unauthenticated. */
export function sessionCapabilities(session: Session | null | undefined): Set<string> {
  const caps = (session as SessionWithCaps | null | undefined)?.user?.capabilities;
  return new Set(caps ?? []);
}

/**
 * True if the session holds at least one of the requested capabilities.
 * Use for both "any-of" gates and single-capability checks.
 *
 *   hasCapability(session, 'picks.release')
 *   hasCapability(session, 'picks.release', 'workorders.assign')  // any-of
 */
export function hasCapability(
  session: Session | null | undefined,
  ...required: Capability[]
): boolean {
  if (!session?.user) return false;
  const caps = sessionCapabilities(session);
  return required.some((c) => caps.has(c));
}

// ─── Server-side guards ──────────────────────────────────────────────────────

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
