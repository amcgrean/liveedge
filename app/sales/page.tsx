import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import SalesHubClient from './SalesHubClient';

export default async function SalesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <SalesHubClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
      agentId={(session.user as { agentId?: string | null }).agentId ?? null}
    />
  );
}
