import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import SubscriptionsClient from './SubscriptionsClient';

export const metadata = { title: 'Email Subscriptions | LiveEdge' };

export default async function SubscriptionsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return <SubscriptionsClient userName={session.user.name} userRole={(session.user as { role?: string }).role} email={session.user.email ?? ''} />;
}
