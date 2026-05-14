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

export type CapabilityMetadata = {
  code: Capability;
  label: string;
  description: string;
  category: 'operations' | 'dispatch' | 'sales' | 'estimating' | 'purchasing' | 'accounting' | 'admin' | 'cross-cutting';
  risk: 'low' | 'medium' | 'high' | 'critical';
};

const CAPABILITIES_METADATA_BY_CODE = {
  [CAPABILITIES.PICKS_RELEASE]: { label: 'Release Picks', description: 'Release picks from staging to outbound workflow.', category: 'operations', risk: 'medium' },
  [CAPABILITIES.PICKERS_MANAGE]: { label: 'Manage Pickers', description: 'Assign and manage picker workload and status.', category: 'operations', risk: 'high' },
  [CAPABILITIES.WORKORDERS_ASSIGN]: { label: 'Assign Work Orders', description: 'Create and assign work orders to operations teams.', category: 'operations', risk: 'high' },
  [CAPABILITIES.YARD_VIEW]: { label: 'View Yard', description: 'View yard operations and order readiness.', category: 'operations', risk: 'low' },
  [CAPABILITIES.DISPATCH_VIEW]: { label: 'View Dispatch', description: 'View route, vehicle, and dispatch execution data.', category: 'dispatch', risk: 'low' },
  [CAPABILITIES.DISPATCH_MANAGE]: { label: 'Manage Dispatch', description: 'Modify dispatch plans, assignments, and delivery execution.', category: 'dispatch', risk: 'high' },
  [CAPABILITIES.SALES_VIEW]: { label: 'View Sales', description: 'Access sales order and customer scorecard experiences.', category: 'sales', risk: 'low' },
  [CAPABILITIES.CUSTOMERS_NOTES_WRITE]: { label: 'Write Customer Notes', description: 'Create and edit customer-facing account notes.', category: 'sales', risk: 'medium' },
  [CAPABILITIES.ORDERS_PUSH_TO_ERP]: { label: 'Push Orders to ERP', description: 'Trigger outbound order synchronization to ERP.', category: 'sales', risk: 'high' },
  [CAPABILITIES.QUOTES_MANAGE]: { label: 'Manage Quotes', description: 'Create, update, and manage sales quotes.', category: 'sales', risk: 'high' },
  [CAPABILITIES.BIDS_MANAGE]: { label: 'Manage Bids', description: 'Create and manage estimating bids.', category: 'estimating', risk: 'high' },
  [CAPABILITIES.DESIGNS_MANAGE]: { label: 'Manage Designs', description: 'Create and maintain design artifacts.', category: 'estimating', risk: 'high' },
  [CAPABILITIES.EWP_MANAGE]: { label: 'Manage EWP', description: 'Maintain engineered wood product records and workflow.', category: 'estimating', risk: 'high' },
  [CAPABILITIES.PROJECTS_MANAGE]: { label: 'Manage Projects', description: 'Create and update project records and assignments.', category: 'estimating', risk: 'high' },
  [CAPABILITIES.PURCHASING_VIEW]: { label: 'View Purchasing', description: 'View purchasing dashboards, POs, and receiving status.', category: 'purchasing', risk: 'low' },
  [CAPABILITIES.PURCHASING_RECEIVE]: { label: 'Receive Purchasing', description: 'Record and process inbound receiving actions.', category: 'purchasing', risk: 'high' },
  [CAPABILITIES.PURCHASING_REVIEW]: { label: 'Review Purchasing', description: 'Approve and review purchasing exceptions and activity.', category: 'purchasing', risk: 'high' },
  [CAPABILITIES.CREDITS_VIEW]: { label: 'View Credits', description: 'Access credits and returns records.', category: 'accounting', risk: 'medium' },
  [CAPABILITIES.CREDITS_MANAGE]: { label: 'Manage Credits', description: 'Create or modify credits and returns outcomes.', category: 'accounting', risk: 'high' },
  [CAPABILITIES.AR_VIEW]: { label: 'View AR', description: 'Access accounts receivable and aging information.', category: 'accounting', risk: 'medium' },
  [CAPABILITIES.ADMIN_USERS_MANAGE]: { label: 'Manage Users', description: 'Create users and modify role/capability assignments.', category: 'admin', risk: 'critical' },
  [CAPABILITIES.ADMIN_AUDIT_VIEW]: { label: 'View Audit', description: 'View security and audit event trails.', category: 'admin', risk: 'high' },
  [CAPABILITIES.ADMIN_CONFIG_MANAGE]: { label: 'Manage Config', description: 'Modify platform-level configuration.', category: 'admin', risk: 'critical' },
  [CAPABILITIES.ADMIN_JOBS_REVIEW]: { label: 'Review Jobs', description: 'Review and triage operational/admin job queues.', category: 'admin', risk: 'high' },
  [CAPABILITIES.ADMIN_PRODUCTS_VIEW]: { label: 'View Product Admin', description: 'Access admin product maintenance surfaces.', category: 'admin', risk: 'medium' },
  [CAPABILITIES.ADMIN_CUSTOMERS_VIEW]: { label: 'View Customer Admin', description: 'Access admin customer maintenance surfaces.', category: 'admin', risk: 'medium' },
  [CAPABILITIES.HUBBELL_REVIEW]: { label: 'Review Hubbell', description: 'Review Hubbell-specific integration or workflow data.', category: 'admin', risk: 'high' },
  [CAPABILITIES.BRANCH_ALL]: { label: 'All Branch Access', description: 'Bypass branch scoping and access all branches.', category: 'cross-cutting', risk: 'critical' },
} as const satisfies Record<Capability, Omit<CapabilityMetadata, 'code'>>;

export const CAPABILITIES_METADATA: readonly CapabilityMetadata[] = (
  Object.entries(CAPABILITIES_METADATA_BY_CODE) as [Capability, Omit<CapabilityMetadata, 'code'>][]
).map(([code, metadata]) => ({ code, ...metadata }));

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
