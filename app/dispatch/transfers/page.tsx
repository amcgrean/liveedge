import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import TransfersClient from './TransfersClient';

export const metadata = { title: 'Branch Transfers' };

export default async function TransfersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

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
