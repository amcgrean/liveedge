import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import { fetchBranchStats, type BranchStats } from '../../src/lib/warehouse-stats';
import { fetchOpenPickSummaries, type OpenPickSummary } from '../../src/lib/warehouse-picks';
import WarehouseClient from './WarehouseClient';

export default async function WarehousePage() {
  const session = await requirePageAccess('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  let stats: BranchStats[] = [];
  let initialPicks: OpenPickSummary[] = [];
  const initialBranch = isAdmin ? '' : (session.user.branch ?? '');
  try {
    [stats, initialPicks] = await Promise.all([
      fetchBranchStats(isAdmin, session.user.branch),
      fetchOpenPickSummaries(initialBranch || null, 300),
    ]);
  } catch (err) {
    console.error('[warehouse page] Failed to load warehouse data:', err);
  }

  return (
    <WarehouseClient
      initialStats={stats}
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
      initialBranch={initialBranch}
      initialPicks={initialPicks}
    />
  );
}
