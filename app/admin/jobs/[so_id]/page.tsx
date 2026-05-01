import { requirePageAccess } from '../../../../src/lib/access-control';
import JobDetailClient from './JobDetailClient';

export const metadata = { title: 'Job Detail — LiveEdge Admin' };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ so_id: string }>;
}) {
  await requirePageAccess('admin.jobs.review');

  const { so_id } = await params;
  return <JobDetailClient soId={so_id} />;
}
