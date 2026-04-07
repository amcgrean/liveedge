import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../../src/components/nav/TopNav';
import PosDetailClient from './PosDetailClient';

export default async function PosDetailPage({ params }: { params: Promise<{ po: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { po } = await params;

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'purchasing'].includes(r));

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <PosDetailClient po={po} isAdmin={isAdmin} />
    </div>
  );
}
