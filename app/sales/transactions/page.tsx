import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import TransactionsClient from './TransactionsClient';

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <TransactionsClient
        isAdmin={isAdmin}
        userBranch={session.user.branch ?? null}
        agentId={(session.user as { agentId?: string | null }).agentId ?? null}
      />
    </div>
  );
}
