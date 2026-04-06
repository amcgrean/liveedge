import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import DeliveryReportingClient from './DeliveryReportingClient';

export default async function OpsDeliveryReportingPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <DeliveryReportingClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
