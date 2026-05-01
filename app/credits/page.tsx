import { requirePageAccess } from '../../src/lib/access-control';
import { TopNav } from '../../src/components/nav/TopNav';
import CreditsClient from './CreditsClient';

export const metadata = { title: 'RMA Credits' };

export default async function CreditsPage() {
  const session = await requirePageAccess('credits.view', 'credits.manage');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CreditsClient />
    </div>
  );
}
