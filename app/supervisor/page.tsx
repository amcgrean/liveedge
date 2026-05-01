import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import SupervisorClient from './SupervisorClient';

export default async function SupervisorPage() {
  const session = await requirePageAccess('pickers.manage', 'workorders.assign');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <SupervisorClient
      isAdmin={isAdmin}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
