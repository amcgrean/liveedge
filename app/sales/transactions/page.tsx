import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import TransactionsClient from './TransactionsClient';

export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  return (
    <TransactionsClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
