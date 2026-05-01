import { requirePageAccess } from '../../../../src/lib/access-control';
import JobsIndexClient from './JobsIndexClient';

export const metadata = { title: 'Hubbell Jobs — LiveEdge Admin' };

export default async function HubbellJobsPage() {
  await requirePageAccess('hubbell.review');
  return <JobsIndexClient />;
}
