import { requirePageAccess } from '../../../src/lib/access-control';
import DriversClient from './DriversClient';

export default async function DriversPage() {
  const session = await requirePageAccess('dispatch.manage');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <DriversClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
