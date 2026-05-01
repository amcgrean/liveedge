import { requirePageAccess } from '../../src/lib/access-control';
import { TopNav } from '../../src/components/nav/TopNav';
import CheckinClient from './CheckinClient';

export const metadata = { title: 'PO Check-In' };

export default async function PurchasingCheckinPage() {
  const session = await requirePageAccess('purchasing.receive');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CheckinClient />
    </div>
  );
}
