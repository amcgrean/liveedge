/**
 * Single source of truth for top-nav dropdowns and homepage module cards.
 *
 * Each MenuItem declares the capabilities (any-of) that make it visible.
 * `visibleMenu()` filters by the session's effective capabilities and
 * hides any group whose items all collapse.
 *
 * Phase 1: definitions + filter helper. Wiring into TopNav and the
 * homepage happens in Phase 3 (after the admin permissions UI ships in
 * Phase 2 so users actually have something to grant).
 *
 * Keep the labels and hrefs in sync with TopNav.tsx until Phase 3 swaps
 * the renderer over.
 */

import type { Session } from 'next-auth';
import {
  CAPABILITIES,
  type Capability,
  hasCapability,
} from './access-control-shared';

export type MenuItem = {
  label: string;
  href: string;
  /** Item is visible if the user holds AT LEAST ONE of these capabilities. */
  requires: readonly Capability[];
};

export type MenuGroup = {
  key: string;
  label: string;
  items: readonly MenuItem[];
};

export const MENU: readonly MenuGroup[] = [
  {
    key: 'yard',
    label: 'Yard',
    items: [
      { label: 'Picks Board',   href: '/warehouse',                requires: [CAPABILITIES.YARD_VIEW, CAPABILITIES.PICKS_RELEASE, CAPABILITIES.WORKORDERS_ASSIGN, CAPABILITIES.PICKERS_MANAGE] },
      { label: 'Open Picks',    href: '/warehouse/open-picks',     requires: [CAPABILITIES.YARD_VIEW, CAPABILITIES.PICKS_RELEASE, CAPABILITIES.WORKORDERS_ASSIGN] },
      { label: 'Picker Stats',  href: '/warehouse/picker-stats',   requires: [CAPABILITIES.PICKERS_MANAGE] },
      { label: 'Work Orders',   href: '/work-orders',              requires: [CAPABILITIES.WORKORDERS_ASSIGN] },
      { label: 'Supervisor',    href: '/supervisor',               requires: [CAPABILITIES.PICKERS_MANAGE] },
      { label: 'Picker Admin',  href: '/warehouse/pickers',        requires: [CAPABILITIES.PICKERS_MANAGE] },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    items: [
      { label: 'Dispatch Board',   href: '/dispatch',     requires: [CAPABILITIES.DISPATCH_MANAGE] },
      { label: 'Delivery Tracker', href: '/delivery',     requires: [CAPABILITIES.DISPATCH_VIEW, CAPABILITIES.DISPATCH_MANAGE] },
      { label: 'Fleet Map',        href: '/delivery/map', requires: [CAPABILITIES.DISPATCH_VIEW, CAPABILITIES.DISPATCH_MANAGE] },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    items: [
      { label: 'Sales Hub',        href: '/sales',                requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'Customers',        href: '/sales/customers',      requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'Transactions',     href: '/sales/transactions',   requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'Purchase History', href: '/sales/history',        requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'Products & Stock', href: '/sales/products',       requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'Reports',          href: '/sales/reports',        requires: [CAPABILITIES.SALES_VIEW] },
      { label: 'RMA Credits',      href: '/credits',              requires: [CAPABILITIES.CREDITS_VIEW, CAPABILITIES.CREDITS_MANAGE] },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    items: [
      { label: 'Estimating App', href: '/estimating',  requires: [CAPABILITIES.BIDS_MANAGE] },
      { label: 'PDF Takeoff',    href: '/takeoff',     requires: [CAPABILITIES.BIDS_MANAGE] },
      { label: 'Bids',           href: '/bids',        requires: [CAPABILITIES.BIDS_MANAGE] },
      { label: 'EWP',            href: '/ewp',         requires: [CAPABILITIES.EWP_MANAGE] },
      { label: 'Projects',       href: '/projects',    requires: [CAPABILITIES.PROJECTS_MANAGE] },
      { label: 'Design',         href: '/designs',     requires: [CAPABILITIES.DESIGNS_MANAGE] },
    ],
  },
  {
    key: 'purchasing',
    label: 'Purchasing',
    items: [
      { label: 'Buyer Workspace',  href: '/purchasing/workspace',  requires: [CAPABILITIES.PURCHASING_VIEW] },
      { label: 'Open POs',         href: '/purchasing/open-pos',   requires: [CAPABILITIES.PURCHASING_VIEW] },
      { label: 'Command Center',   href: '/purchasing/manage',     requires: [CAPABILITIES.PURCHASING_VIEW] },
      { label: 'Vendor Scorecard', href: '/purchasing/scorecard',  requires: [CAPABILITIES.PURCHASING_VIEW] },
      { label: 'PO Check-In',      href: '/purchasing',            requires: [CAPABILITIES.PURCHASING_RECEIVE] },
      { label: 'Review Queue',     href: '/purchasing/review',     requires: [CAPABILITIES.PURCHASING_REVIEW] },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    items: [
      { label: 'Customers',      href: '/admin/customers',     requires: [CAPABILITIES.ADMIN_CUSTOMERS_VIEW, CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Products/SKUs',  href: '/admin/products',      requires: [CAPABILITIES.ADMIN_PRODUCTS_VIEW, CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Formulas',       href: '/admin/formulas',      requires: [CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Bid Fields',     href: '/admin/bid-fields',    requires: [CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Users',          href: '/admin/users',         requires: [CAPABILITIES.ADMIN_USERS_MANAGE] },
      { label: 'Notifications',  href: '/admin/notifications', requires: [CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Audit Log',      href: '/admin/audit',         requires: [CAPABILITIES.ADMIN_AUDIT_VIEW] },
      { label: 'ERP Sync',       href: '/admin/erp',           requires: [CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Page Analytics', href: '/admin/analytics',     requires: [CAPABILITIES.ADMIN_CONFIG_MANAGE] },
      { label: 'Job Review',     href: '/admin/jobs',          requires: [CAPABILITIES.ADMIN_JOBS_REVIEW] },
      { label: 'Hubbell',        href: '/admin/hubbell',       requires: [CAPABILITIES.HUBBELL_REVIEW] },
    ],
  },
];

/**
 * Filter MENU down to what this session can see.
 * A group is dropped entirely when none of its items are visible.
 */
export function visibleMenu(session: Session | null | undefined): MenuGroup[] {
  if (!session?.user) return [];
  const out: MenuGroup[] = [];
  for (const group of MENU) {
    const items = group.items.filter((it) => hasCapability(session, ...it.requires));
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}

/** True if the user can see any item in the named group. */
export function isGroupVisible(
  session: Session | null | undefined,
  groupKey: string
): boolean {
  const group = MENU.find((g) => g.key === groupKey);
  if (!group) return false;
  return group.items.some((it) => hasCapability(session, ...it.requires));
}
