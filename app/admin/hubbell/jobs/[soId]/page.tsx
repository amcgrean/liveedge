import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import JobEmailsClient from './JobEmailsClient';

export const metadata = { title: 'Job Emails — LiveEdge Admin' };

export default async function JobEmailsPage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? '';
  if (role !== 'admin') redirect('/');

  const { soId } = await params;
  return <JobEmailsClient soId={soId} />;
}
