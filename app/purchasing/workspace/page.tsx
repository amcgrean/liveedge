import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import WorkspaceClient from './WorkspaceClient';

export const metadata = { title: 'Buyer Workspace' };

export default async function BuyerWorkspacePage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <WorkspaceClient userBranch={session.user.branch ?? null} />
    </div>
  );
}
