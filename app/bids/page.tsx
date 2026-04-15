import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import BidsListClient from './BidsListClient';

export const metadata = { title: 'Bids | LiveEdge' };

export default async function BidsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <BidsListClient session={session} />;
}
