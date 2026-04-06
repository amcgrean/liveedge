import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import DriversClient from './DriversClient';

export default async function DriversPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const canAccess =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch'].includes(r));
  if (!canAccess) redirect('/');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <DriversClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
