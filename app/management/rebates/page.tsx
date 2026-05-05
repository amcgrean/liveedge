import { requirePageAccess } from '@/lib/access-control';
import { CAPABILITIES } from '@/lib/access-control-shared';
import {
  fetchRebatePrograms,
  fetchVendorOptions,
  fetchProductGroupOptions,
} from './actions';
import RebatesClient from './RebatesClient';

export const metadata = { title: 'Rebate Rules — Beisser LiveEdge' };
export const maxDuration = 60;

export default async function RebatesPage() {
  await requirePageAccess(CAPABILITIES.PURCHASING_VIEW);

  const [programsRes, vendorsRes, groupsRes] = await Promise.allSettled([
    fetchRebatePrograms(),
    fetchVendorOptions(),
    fetchProductGroupOptions(),
  ]);

  if (programsRes.status === 'rejected') {
    console.error('[rebates/page] fetchRebatePrograms failed:', programsRes.reason);
  }

  return (
    <RebatesClient
      initialPrograms={programsRes.status === 'fulfilled' ? programsRes.value : []}
      vendors={vendorsRes.status === 'fulfilled' ? vendorsRes.value : []}
      productGroups={groupsRes.status === 'fulfilled' ? groupsRes.value : []}
    />
  );
}
