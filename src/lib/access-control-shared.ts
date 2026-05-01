/**
 * Client-safe capability primitives — NO imports from auth.ts or any server-only module.
 *
 * This file is intentionally separate from access-control.ts so that
 * 'use client' components (TopNav, PermissionsClient, HomeClient, etc.) can
 * import capability helpers without pulling in the postgres driver that ships
 * with auth.ts. Server-only guards (requireCapability, requirePageAccess)
 * live in access-control.ts and re-export everything from here.
 */

import type { Session } from 'next-auth';

// ─── Capability vocabulary ────────────────────────────────────────────────────

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

// ─── Computation ──────────────────────────────────────────────────────────────

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

// ─── Session-level helpers ────────────────────────────────────────────────────

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
