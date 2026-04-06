import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import CheckinClient from './CheckinClient';

export const metadata = { title: 'PO Check-In' };

export default async function PurchasingCheckinPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CheckinClient />
    </div>
  );
}
