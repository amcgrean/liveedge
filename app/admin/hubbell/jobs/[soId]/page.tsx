import { requirePageAccess } from '../../../../../src/lib/access-control';
import JobDetailClient from './JobDetailClient';

export const metadata = { title: 'Job Detail — LiveEdge Admin' };

export default async function HubbellJobDetailPage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  await requirePageAccess('hubbell.review');
  const { soId } = await params;
  return <JobDetailClient soId={soId} />;
}
