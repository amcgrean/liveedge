import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import { getSelectedBranchCode } from '../../../src/lib/branch-context';
import OpenPosClient from './OpenPosClient';

export const metadata = { title: 'Open Purchase Orders' };

export default async function OpenPosPage() {
  const session = await requirePageAccess('purchasing.view');

  const isAdmin = hasCapability(session, 'branch.all');
  const cookieBranch = isAdmin ? (await getSelectedBranchCode()) : null;
  const initialBranch = session.user.branch ?? cookieBranch ?? '';

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <OpenPosClient
        isAdmin={isAdmin}
        userBranch={initialBranch}
      />
    </div>
  );
}
