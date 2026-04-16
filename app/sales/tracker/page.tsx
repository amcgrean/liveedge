import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import SalesTrackerClient from './SalesTrackerClient';

export default async function SalesTrackerPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <SalesTrackerClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
