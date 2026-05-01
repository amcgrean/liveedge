import { requirePageAccess } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import OpenPicksClient from './OpenPicksClient';

export default async function OpenPicksPage() {
  const session = await requirePageAccess('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <OpenPicksClient isAdmin={isAdmin} />
    </div>
  );
}
