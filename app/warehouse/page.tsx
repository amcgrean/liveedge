import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import { fetchBranchStats, type BranchStats } from '../../src/lib/warehouse-stats';
import WarehouseClient from './WarehouseClient';

export default async function WarehousePage() {
  const session = await requirePageAccess('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  let stats: BranchStats[] = [];
  try {
    stats = await fetchBranchStats(isAdmin, session.user.branch);
  } catch (err) {
    console.error('[warehouse page] Failed to load stats:', err);
  }

  return (
    <WarehouseClient
      initialStats={stats}
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
