import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import JobsClient from './JobsClient';

export const metadata = { title: 'Job Review — LiveEdge Admin' };

export default async function JobsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/');

  return <JobsClient />;
}
