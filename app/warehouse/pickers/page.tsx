import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import PickerAdminClient from './PickerAdminClient';

export default async function PickerAdminPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor'].includes(r));

  if (!isAdmin) redirect('/warehouse');

  return <PickerAdminClient />;
}
