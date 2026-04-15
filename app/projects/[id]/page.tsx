import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ManageProjectClient from './ManageProjectClient';

export const metadata = { title: 'Manage Project | LiveEdge' };

export default async function ManageProjectPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <ManageProjectClient session={session} />;
}
