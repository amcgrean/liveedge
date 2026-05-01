import { requirePageAccess } from '../../../src/lib/access-control';
import { hasCapability } from '../../../src/lib/access-control-shared';
import { TopNav } from '../../../src/components/nav/TopNav';
import ReportsClient from './ReportsClient';

export default async function ReportsPage() {
  const session = await requirePageAccess('sales.view');

  const isAdmin = hasCapability(session, 'admin.config.manage');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <ReportsClient
        isAdmin={isAdmin}
        userBranch={session.user.branch ?? null}
      />
    </div>
  );
}
