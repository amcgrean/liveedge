import { requirePageAccess } from '../../../../src/lib/access-control';
import { TopNav } from '../../../../src/components/nav/TopNav';
import ReviewDetailClient from './ReviewDetailClient';

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageAccess('purchasing.review');

  const { id } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <ReviewDetailClient id={id} />
    </div>
  );
}
