import { requirePageAccess } from '../../../src/lib/access-control';
import { hasCapability } from '../../../src/lib/access-control-shared';
import SalesTrackerClient from './SalesTrackerClient';

export default async function SalesTrackerPage() {
  const session = await requirePageAccess('sales.view');

  const isAdmin = hasCapability(session, 'admin.config.manage');

  return (
    <SalesTrackerClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
