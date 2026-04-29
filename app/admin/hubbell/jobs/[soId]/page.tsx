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
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (role !== 'admin' && !roles.includes('hubbell')) redirect('/');

  const { soId } = await params;
  return <JobEmailsClient soId={soId} />;
}
