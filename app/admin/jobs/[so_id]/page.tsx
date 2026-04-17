import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import JobDetailClient from './JobDetailClient';

export const metadata = { title: 'Job Detail — LiveEdge Admin' };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ so_id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/');

  const { so_id } = await params;
  return <JobDetailClient soId={so_id} />;
}
