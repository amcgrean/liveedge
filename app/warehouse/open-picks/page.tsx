import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import { fetchOpenPickers, type PickerSummary } from '../../../src/lib/warehouse-open-picks';
import OpenPicksClient from './OpenPicksClient';

export default async function OpenPicksPage() {
  const session = await requirePageAccess('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');

  const isAdmin = hasCapability(session, 'branch.all');

  let initialPickers: PickerSummary[] = [];
  try {
    initialPickers = await fetchOpenPickers();
  } catch (err) {
    console.error('[warehouse/open-picks page] Failed to load initial pickers:', err);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <OpenPicksClient isAdmin={isAdmin} initialPickers={initialPickers} />
    </div>
  );
}
