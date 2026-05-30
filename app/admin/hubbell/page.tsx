import { requirePageAccess } from '../../../src/lib/access-control';
import HubbellHubClient from './HubbellHubClient';

export const metadata = { title: 'Hubbell — LiveEdge Admin' };

export default async function HubbellPage() {
  await requirePageAccess('hubbell.review');
  return <HubbellHubClient />;
}
