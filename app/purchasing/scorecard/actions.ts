'use server';

import { fetchVendorDetail } from '@/lib/vendor-scorecard/queries';
import type { VendorDetail, VendorScorecardParams } from '@/lib/vendor-scorecard/types';

export async function getVendorDetail(
  supplierKey: string,
  params: VendorScorecardParams,
): Promise<VendorDetail | null> {
  return fetchVendorDetail(supplierKey, params);
}
