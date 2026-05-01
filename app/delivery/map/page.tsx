import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import MapClient from './MapClient';

export default async function DeliveryMapPage() {
  const session = await requirePageAccess('dispatch.view', 'dispatch.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <MapClient
        isAdmin={isAdmin}
        userBranch={session.user.branch ?? null}
      />
    </div>
  );
}
