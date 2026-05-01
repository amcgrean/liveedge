import { requirePageAccess } from '../../../src/lib/access-control';
import JobsClient from './JobsClient';

export const metadata = { title: 'Job Review — LiveEdge Admin' };

export default async function JobsPage() {
  await requirePageAccess('admin.jobs.review');
  return <JobsClient />;
}
