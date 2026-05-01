import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import DriversClient from './DriversClient';

export default async function DriversPage() {
  const session = await requirePageAccess('dispatch.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <DriversClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
