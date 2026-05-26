import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import OutagesClient from './OutagesClient';

export const metadata = { title: 'Potential Outages | LiveEdge' };

export default async function OutagesPage() {
  const session = await requirePageAccess('purchasing.view');
  const isAllBranchUser = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user?.name ?? null} userRole={session.user?.role} />
      <OutagesClient
        userBranch={session.user?.branch ?? null}
        isAllBranchUser={isAllBranchUser}
      />
    </div>
  );
}
