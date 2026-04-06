import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AddEWPClient from './AddEWPClient';

export const metadata = { title: 'New EWP | LiveEdge' };

export default async function AddEWPPage() {
  const session = await auth();
  if (!session) redirect('/ops-login');
  return <AddEWPClient session={session} />;
}
