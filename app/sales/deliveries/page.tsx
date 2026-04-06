import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import SalesDeliveriesClient from './SalesDeliveriesClient';

export default async function SalesDeliveriesPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  return (
    <SalesDeliveriesClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
