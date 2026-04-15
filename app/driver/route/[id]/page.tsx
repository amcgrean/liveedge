import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import DriverRouteClient from './DriverRouteClient';

export const metadata = { title: 'Route — LiveEdge Driver' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverRoutePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;
  return (
    <DriverRouteClient
      routeId={parseInt(id, 10)}
      driverName={session.user.name ?? ''}
    />
  );
}
