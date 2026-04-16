import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AddBidClient from './AddBidClient';

export const metadata = { title: 'New Bid | LiveEdge' };

export default async function AddBidPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <AddBidClient session={session} />;
}
