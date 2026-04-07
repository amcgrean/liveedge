import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../../src/components/nav/TopNav';
import ReviewDetailClient from './ReviewDetailClient';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  if (!isAdmin) redirect('/purchasing/review');

  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <ReviewDetailClient id={id} />
    </div>
  );
}
