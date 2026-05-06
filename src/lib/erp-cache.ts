import { unstable_cache } from 'next/cache';

// 5-minute TTL for all ERP analytical reads. These are management/dashboard
// metrics that don't need real-time accuracy. Caching means concurrent users
// share a single result set rather than each triggering expensive DB queries.
//
// Usage:
//   async function _fetchMyMetric(params: MyParams) { ... }
//   export const fetchMyMetric = erpCache(_fetchMyMetric, ['my-metric']);
//
// Use the 'erp' tag for on-demand revalidation:
//   import { revalidateTag } from 'next/cache';
//   revalidateTag('erp'); // bust all ERP caches

export const ERP_CACHE_TTL = 300; // seconds

export function erpCache<T extends (...args: never[]) => Promise<unknown>>(
  fn: T,
  keyParts: string[],
): T {
  return unstable_cache(fn as (...args: unknown[]) => Promise<unknown>, ['erp', ...keyParts], {
    revalidate: ERP_CACHE_TTL,
    tags: ['erp'],
  }) as T;
}
