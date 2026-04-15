import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import OpenPicksClient from './OpenPicksClient';

export default async function OpenPicksPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));

  return <OpenPicksClient isAdmin={isAdmin} />;
}
