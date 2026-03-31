import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import NotificationsClient from './NotificationsClient';

export const metadata = { title: 'Notifications | Beisser Admin' };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/dashboard');
  return <NotificationsClient />;
}
