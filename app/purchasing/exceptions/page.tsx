import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import { TopNav } from '../../../src/components/nav/TopNav';
import ExceptionsClient from './ExceptionsClient';

export const metadata = { title: 'Purchasing Exceptions' };

export default async function ExceptionsPage() {
  const session = await requirePageAccess('purchasing.view', 'purchasing.review');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <ExceptionsClient isAdmin={isAdmin} userBranch={session.user.branch ?? null} />
    </div>
  );
}
