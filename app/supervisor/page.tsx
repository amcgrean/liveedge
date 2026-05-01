import { requirePageAccess } from '../../src/lib/access-control';
import SupervisorClient from './SupervisorClient';

export default async function SupervisorPage() {
  const session = await requirePageAccess('pickers.manage', 'workorders.assign');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <SupervisorClient
      isAdmin={isAdmin}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
