import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import PickerStatsClient from './PickerStatsClient';

export default async function PickerStatsPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'warehouse'].includes(r));

  return <PickerStatsClient isAdmin={isAdmin} />;
}
