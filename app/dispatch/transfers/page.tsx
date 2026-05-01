import { redirect } from 'next/navigation';
import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import TransfersClient from './TransfersClient';

export const metadata = { title: 'Branch Transfers' };

export default async function TransfersPage() {
  const session = await requirePageAccess('dispatch.view');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <TransfersClient
        isAdmin={isAdmin}
        userBranch={session.user.branch ?? null}
      />
    </div>
  );
}
