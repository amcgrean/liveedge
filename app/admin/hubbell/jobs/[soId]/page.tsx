import { requirePageAccess } from '../../../../../src/lib/access-control';
import JobEmailsClient from './JobEmailsClient';

export const metadata = { title: 'Job Emails — LiveEdge Admin' };

export default async function JobEmailsPage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  await requirePageAccess('hubbell.review');
  const { soId } = await params;
  return <JobEmailsClient soId={soId} />;
}
