import { requirePageAccess } from '../../../../src/lib/access-control';
import SuggestionsClient from './SuggestionsClient';

export const metadata = { title: 'Hubbell Suggested Matches — LiveEdge Admin' };

export default async function SuggestionsPage() {
  await requirePageAccess('hubbell.review');
  return <SuggestionsClient />;
}
