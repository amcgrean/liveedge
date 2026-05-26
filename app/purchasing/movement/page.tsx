import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import MovementClient from './MovementClient';

export const metadata = { title: 'Recent Movement | LiveEdge' };

export default async function MovementPage() {
  const session = await requirePageAccess('purchasing.view');
  const isAllBranchUser = hasCapability(session, 'branch.all');
  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user?.name ?? null} userRole={session.user?.role} />
      <MovementClient
        userBranch={session.user?.branch ?? null}
        isAllBranchUser={isAllBranchUser}
      />
    </div>
  );
}
