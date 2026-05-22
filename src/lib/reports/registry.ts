import { z } from 'zod';
import type { Capability } from '../access-control-shared';

// Single source of truth for what reports are subscribable, their param
// schemas, display names, and required capabilities. The CRUD API validates
// against this and the cron uses it to dispatch to the right digest module.

export const REPORT_KEYS = [
  'sales-reports',
  'delivery-reports',
  'scorecard-overview',
] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

// ─── Per-report param schemas ────────────────────────────────────────────────
const branchSchema   = z.string().trim().max(16).optional().default('');

const salesReportsParams = z.object({
  period: z.coerce.number().int().min(7).max(365).default(30),
  branch: branchSchema,
});

const deliveryReportsParams = z.object({
  window:    z.enum(['7d', '30d', '90d']).default('30d'),
  branch:    branchSchema,
  sale_type: z.string().trim().max(32).default('all'),
});

const scorecardOverviewParams = z.object({
  // Year fields default to "current year vs prior" — resolved at send time
  // when null so the subscription stays evergreen.
  baseYear:    z.coerce.number().int().min(2000).max(2100).nullable().default(null),
  compareYear: z.coerce.number().int().min(2000).max(2100).nullable().default(null),
  period:      z.enum(['YTD', 'Full Year']).default('YTD'),
  // Empty string = all branches.
  branchIds:   z.array(z.string().trim().max(16)).default([]),
});

export type SalesReportsParams       = z.infer<typeof salesReportsParams>;
export type DeliveryReportsParams    = z.infer<typeof deliveryReportsParams>;
export type ScorecardOverviewParams  = z.infer<typeof scorecardOverviewParams>;

// ─── Report descriptors ──────────────────────────────────────────────────────
export interface ReportDescriptor<P = unknown> {
  key: ReportKey;
  label:       string;
  description: string;
  pagePath:    string;
  capability:  Capability;
  paramsSchema: z.ZodType<P>;
  /**
   * Human-readable summary of the captured params for the subscribe-confirm
   * card and the email subject. Receives parsed params.
   */
  formatParamsSummary: (params: P) => string;
}

export const REPORTS: Record<ReportKey, ReportDescriptor> = {
  'sales-reports': {
    key: 'sales-reports',
    label: 'Sales Reports',
    description: 'Sales-order activity, daily series, top customers, sale-type & status breakdowns.',
    pagePath: '/sales/reports',
    capability: 'sales.view',
    paramsSchema: salesReportsParams,
    formatParamsSummary: (raw) => {
      const p = raw as SalesReportsParams;
      const branchLabel = p.branch ? `Branch ${p.branch}` : 'All branches';
      return `${branchLabel} · Last ${p.period} days`;
    },
  },
  'delivery-reports': {
    key: 'delivery-reports',
    label: 'Delivery Reports',
    description: 'Fulfilled deliveries by day, branch, sale type, and ship-via.',
    pagePath: '/ops/delivery-reporting',
    capability: 'dispatch.manage',
    paramsSchema: deliveryReportsParams,
    formatParamsSummary: (raw) => {
      const p = raw as DeliveryReportsParams;
      const branchLabel = p.branch ? `Branch ${p.branch}` : 'All branches';
      const saleType = p.sale_type === 'all' ? 'All sale types' : p.sale_type;
      return `${branchLabel} · ${saleType} · Last ${p.window}`;
    },
  },
  'scorecard-overview': {
    key: 'scorecard-overview',
    label: 'Scorecard Overview',
    description: 'Company-wide 3-year sales & margin, KPIs, branch contribution, branch breakdown.',
    pagePath: '/scorecard/overview',
    capability: 'sales.view',
    paramsSchema: scorecardOverviewParams,
    formatParamsSummary: (raw) => {
      const p = raw as ScorecardOverviewParams;
      const branchLabel = p.branchIds.length === 0
        ? 'All branches'
        : `Branches ${p.branchIds.join(', ')}`;
      return `${branchLabel} · ${p.period}`;
    },
  },
};

export function getReport(key: string): ReportDescriptor | null {
  if ((REPORT_KEYS as readonly string[]).includes(key)) {
    return REPORTS[key as ReportKey];
  }
  return null;
}

export function validateParams(key: ReportKey, raw: unknown): unknown {
  return REPORTS[key].paramsSchema.parse(raw ?? {});
}
