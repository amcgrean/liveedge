import { requirePageAccess } from '../../src/lib/access-control';
import DeliveryClient from './DeliveryClient';

export default async function DeliveryPage() {
  const session = await requirePageAccess('dispatch.view', 'dispatch.manage');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));

  return (
    <DeliveryClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
