import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageBidClient from './ManageBidClient';

export const metadata = { title: 'Manage Bid | LiveEdge' };

export default async function ManageBidPage() {
  const session = await auth();
  if (!session) redirect('/ops-login');
  return <ManageBidClient session={session} />;
}
