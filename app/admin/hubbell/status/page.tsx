import { requirePageAccess } from '../../../../src/lib/access-control';
import StatusClient from './StatusClient';

export const metadata = { title: 'Hubbell Status — LiveEdge Admin' };

export default async function HubbellStatusPage() {
  await requirePageAccess('hubbell.review');
  return <StatusClient />;
}
