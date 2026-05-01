import { requirePageAccess, hasCapability } from '../../../../src/lib/access-control';
import { TopNav } from '../../../../src/components/nav/TopNav';
import PosDetailClient from './PosDetailClient';

export default async function PosDetailPage({ params }: { params: Promise<{ po: string }> }) {
  const session = await requirePageAccess('purchasing.view', 'purchasing.receive');

  const { po } = await params;
  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <PosDetailClient po={po} isAdmin={isAdmin} />
    </div>
  );
}
