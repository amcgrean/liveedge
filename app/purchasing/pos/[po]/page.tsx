import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import PosDetailClient from './PosDetailClient';

export default async function PosDetailPage({ params }: { params: Promise<{ po: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { po } = await params;

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'purchasing'].includes(r));

  return <PosDetailClient po={po} isAdmin={isAdmin} />;
}
