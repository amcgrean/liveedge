import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  return (
    <HistoryClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
