import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import SupervisorClient from './SupervisorClient';

export default async function SupervisorPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <SupervisorClient
      isAdmin={isAdmin}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
