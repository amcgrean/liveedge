import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import LegacyBidsClient from './LegacyBidsClient';

export const metadata = { title: 'Open Bids | LiveEdge' };

export default async function LegacyBidsPage() {
  const session = await auth();
  if (!session) redirect('/ops-login');
  return <LegacyBidsClient session={session} />;
}
