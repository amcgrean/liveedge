import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import HubbellClient from './HubbellClient';

export const metadata = { title: 'Hubbell Emails — LiveEdge Admin' };

export default async function HubbellPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? '';
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (role !== 'admin' && !roles.includes('hubbell')) redirect('/');

  return <HubbellClient />;
}
