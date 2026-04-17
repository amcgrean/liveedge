import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import TransfersClient from './TransfersClient';

export default async function TransfersPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));

  return (
    <TransfersClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
