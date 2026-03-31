import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import BidFieldsClient from './BidFieldsClient';

export const metadata = { title: 'Bid Fields | Beisser Admin' };

export default async function BidFieldsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/dashboard');
  return <BidFieldsClient />;
}
