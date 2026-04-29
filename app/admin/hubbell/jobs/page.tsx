import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import JobsIndexClient from './JobsIndexClient';

export const metadata = { title: 'Hubbell Jobs — LiveEdge Admin' };

export default async function HubbellJobsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') redirect('/');
  return <JobsIndexClient />;
}
