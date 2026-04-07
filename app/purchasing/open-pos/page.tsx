import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import { getSelectedBranchCode } from '../../../src/lib/branch-context';
import OpenPosClient from './OpenPosClient';

export const metadata = { title: 'Open Purchase Orders' };

export default async function OpenPosPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'purchasing'].includes(r));

  if (!isAdmin && !(session.user.roles ?? []).some((r) => ['purchasing', 'warehouse'].includes(r))) {
    redirect('/purchasing');
  }

  // Use branch cookie for admins so TopNav switcher auto-filters the list
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
