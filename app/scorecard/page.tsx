import { fetchCustomerList } from '../../src/lib/scorecard/queries';
import ScorecardListClient from './ScorecardListClient';
import ScorecardTabs from './_components/ScorecardTabs';

export default async function ScorecardIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const baseYear = parseInt(String(sp.baseYear ?? currentYear), 10);
  const compareYear = parseInt(String(sp.compareYear ?? baseYear - 1), 10);
  const period = String(sp.period ?? 'YTD');
  const cutoffDate = String(sp.cutoffDate ?? today);
  const search = String(sp.q ?? '');
  const branchIds = sp.branch
    ? Array.isArray(sp.branch) ? sp.branch : [sp.branch]
    : [];

  const customers = await fetchCustomerList(baseYear, compareYear, branchIds, search, 200, period, cutoffDate);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <ScorecardTabs />
      <ScorecardListClient
        customers={customers}
        baseYear={baseYear}
        compareYear={compareYear}
        search={search}
        branchIds={branchIds}
      />
    </div>
  );
}
