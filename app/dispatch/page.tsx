import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import DispatchClient from './DispatchClient';

export default async function DispatchPage() {
  const session = await requirePageAccess('dispatch.view', 'dispatch.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <DispatchClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
