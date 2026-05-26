import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import WorkspaceClient from './WorkspaceClient';

export const metadata = { title: 'Buyer Workspace | LiveEdge' };

export default async function BuyerWorkspacePage() {
  const session = await requirePageAccess('purchasing.view');
  const isAllBranchUser = hasCapability(session, 'branch.all');

  return (
    <>
      <TopNav userName={session.user?.name ?? null} userRole={session.user?.role} />
      <WorkspaceClient
        userName={session.user?.name ?? null}
        userRole={session.user?.role ?? null}
        userBranch={session.user?.branch ?? null}
        isAllBranchUser={isAllBranchUser}
      />
    </>
  );
}
