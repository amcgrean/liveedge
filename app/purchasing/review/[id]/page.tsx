import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import ReviewDetailClient from './ReviewDetailClient';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  if (!isAdmin) redirect('/purchasing/review');

  const { id } = await params;

  return <ReviewDetailClient id={id} />;
}
