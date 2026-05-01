import { requirePageAccess } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import PickerAdminClient from './PickerAdminClient';

export default async function PickerAdminPage() {
  const session = await requirePageAccess('pickers.manage');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <PickerAdminClient />
    </div>
  );
}
