import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import DeliveryReportingClient from './DeliveryReportingClient';

export default async function OpsDeliveryReportingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <DeliveryReportingClient
        isAdmin={isAdmin}
        userBranch={session.user.branch ?? null}
      />
    </div>
  );
}
