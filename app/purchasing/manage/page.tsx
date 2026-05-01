import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import CommandCenterClient from './CommandCenterClient';

export const metadata = { title: 'Purchasing Command Center' };

export default async function CommandCenterPage() {
  const session = await requirePageAccess('purchasing.view');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CommandCenterClient isAdmin={isAdmin} />
    </div>
  );
}
