import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import DriverRouteClient from './DriverRouteClient';
import { TopNav } from '@/components/nav/TopNav';

export const metadata = { title: 'Route — LiveEdge Driver' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverRoutePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  return (
    <>
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <DriverRouteClient
      routeId={parseInt(id, 10)}
      driverName={session.user.name ?? ''}
    />
    </>
  );
}
