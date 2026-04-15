import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import EWPClient from './EWPClient';

export const metadata = { title: 'EWP | LiveEdge' };

export default async function EWPPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <EWPClient session={session} />;
}
