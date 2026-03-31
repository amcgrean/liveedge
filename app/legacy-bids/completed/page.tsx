import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import CompletedBidsClient from './CompletedBidsClient';

export const metadata = { title: 'Completed Bids | Beisser Lumber' };

export default async function CompletedBidsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <CompletedBidsClient session={session} />;
}
