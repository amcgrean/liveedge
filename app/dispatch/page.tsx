import { requirePageAccess } from '../../src/lib/access-control';
import DispatchClient from './DispatchClient';

export default async function DispatchPage() {
  const session = await requirePageAccess('dispatch.view', 'dispatch.manage');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'management', 'supervisor', 'ops'].includes(r));

  return (
    <DispatchClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
