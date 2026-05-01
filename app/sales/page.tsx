import { requirePageAccess } from '../../src/lib/access-control';
import { hasCapability } from '../../src/lib/access-control-shared';
import SalesHubClient from './SalesHubClient';

export default async function SalesPage() {
  const session = await requirePageAccess('sales.view');

  const isAdmin = hasCapability(session, 'admin.config.manage');

  return (
    <SalesHubClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
      agentId={(session.user as { agentId?: string | null }).agentId ?? null}
    />
  );
}
