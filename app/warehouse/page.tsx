import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { fetchBranchStats, type BranchStats } from '../../src/lib/warehouse-stats';
import WarehouseClient from './WarehouseClient';

export default async function WarehousePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r: string) => ['admin', 'supervisor', 'ops'].includes(r));

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
