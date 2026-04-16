import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import AllBidsClient from './AllBidsClient';

export const metadata = { title: 'All Bids | LiveEdge' };

export default async function AllBidsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <AllBidsClient session={session} />;
}
