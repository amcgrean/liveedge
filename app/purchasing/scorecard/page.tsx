import { requirePageAccess } from '@/lib/access-control';
import { CAPABILITIES } from '@/lib/access-control-shared';
import { TopNav } from '@/components/nav/TopNav';
import Breadcrumb from '@/components/Breadcrumb';
import {
  fetchVendorScorecardSummary,
  fetchVendorList,
  fetchProductGroups,
  fetchVendorBranchSummary,
} from '@/lib/vendor-scorecard/queries';
import type { VendorScorecardParams } from '@/lib/vendor-scorecard/types';
import VendorScorecardClient from './VendorScorecardClient';

export const metadata = { title: 'Vendor Scorecard — Beisser LiveEdge' };
export const maxDuration = 300;

export default async function VendorScorecardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const session = await requirePageAccess(CAPABILITIES.PURCHASING_VIEW);

  const sp = await searchParams;

  const range = (String(sp.range ?? 'YTD')) as VendorScorecardParams['range'];
  const branch = String(sp.branch ?? 'all');
  const productGroup = String(sp.pg ?? 'all');

  const params: VendorScorecardParams = { range, branch, productGroup };

  const [summaryRes, vendorsRes, groupsRes, branchSummaryRes] = await Promise.allSettled([
    fetchVendorScorecardSummary(params),
    fetchVendorList(params),
    fetchProductGroups({ range, branch }),
    fetchVendorBranchSummary(params),
  ]);

  const summary =
    summaryRes.status === 'fulfilled'
      ? summaryRes.value
      : {
          totalSpendYTD: 0, totalSpendPY: 0,
          totalRebateEarned: 0, totalRebateAccrued: 0, totalRebateForecastFY: 0,
          top3ConcentrationPct: 0,
          programsOnTrack: 0, programsAtRisk: 0, programsMissed: 0,
          avgFillRatePct: null, avgOtdPct: null,
        };

  const vendors = vendorsRes.status === 'fulfilled' ? vendorsRes.value : [];
  const productGroups = groupsRes.status === 'fulfilled' ? groupsRes.value : [];
  const branchSummary = branchSummaryRes.status === 'fulfilled' ? branchSummaryRes.value : [];

  if (summaryRes.status === 'rejected') {
    console.error('[vendor-scorecard] summary query failed:', summaryRes.reason);
  }
  if (vendorsRes.status === 'rejected') {
    console.error('[vendor-scorecard] vendor list failed:', vendorsRes.reason);
  }
  if (branchSummaryRes.status === 'rejected') {
    console.error('[vendor-scorecard] branch summary failed:', branchSummaryRes.reason);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <Breadcrumb
        items={[
          { href: '/purchasing', label: 'Purchasing' },
          { label: 'Vendor Scorecard' },
        ]}
      />
      <VendorScorecardClient
        summary={summary}
        vendors={vendors}
        productGroups={productGroups}
        branchSummary={branchSummary}
        initialParams={params}
      />
    </div>
  );
}
