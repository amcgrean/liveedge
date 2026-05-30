import { requirePageAccess } from '../../../../src/lib/access-control';
import ChecksPageClient from './ChecksPageClient';

export const metadata = { title: 'Hubbell Checks — LiveEdge Admin' };

export default async function HubbellChecksPage() {
  await requirePageAccess('hubbell.review');
  return <ChecksPageClient />;
}
