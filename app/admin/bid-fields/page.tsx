import { requirePageAccess } from '../../../src/lib/access-control';
import BidFieldsClient from './BidFieldsClient';

export const metadata = { title: 'Bid Fields | LiveEdge' };

export default async function BidFieldsPage() {
  await requirePageAccess('admin.config.manage');
  return <BidFieldsClient />;
}
