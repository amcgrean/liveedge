import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageBidClient from './ManageBidClient';

export const metadata = { title: 'Manage Bid | Beisser Lumber' };

export default async function ManageBidPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ManageBidClient session={session} />;
}
