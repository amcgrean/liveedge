import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import PickerStatsClient from './PickerStatsClient';

export default async function PickerStatsPage() {
  const session = await requirePageAccess('pickers.manage', 'yard.view');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <PickerStatsClient isAdmin={isAdmin} />
    </div>
  );
}
