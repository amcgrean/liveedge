import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageDesignClient from './ManageDesignClient';

export const metadata = { title: 'Manage Design | Beisser Lumber' };

export default async function ManageDesignPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ManageDesignClient session={session} />;
}
