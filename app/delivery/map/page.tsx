import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import MapClient from './MapClient';

export default async function DeliveryMapPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'dispatch', 'delivery'].includes(r));

  return (
    <MapClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
