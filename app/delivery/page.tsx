import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import DeliveryClient from './DeliveryClient';

export default async function DeliveryPage() {
  const session = await requirePageAccess('dispatch.view', 'dispatch.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <DeliveryClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
