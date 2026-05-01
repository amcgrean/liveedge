import { requirePageAccess } from '../../../src/lib/access-control';
import HubbellClient from './HubbellClient';

export const metadata = { title: 'Hubbell Emails — LiveEdge Admin' };

export default async function HubbellPage() {
  await requirePageAccess('hubbell.review');
  return <HubbellClient />;
}
