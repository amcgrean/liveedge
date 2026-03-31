import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageEWPClient from './ManageEWPClient';

export const metadata = { title: 'Manage EWP | Beisser Lumber' };

export default async function ManageEWPPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ManageEWPClient session={session} />;
}
