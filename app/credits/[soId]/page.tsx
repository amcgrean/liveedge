import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../src/components/nav/TopNav';
import CreditDetailClient from './CreditDetailClient';

export const metadata = { title: 'Credit Memo Detail' };

export default async function CreditDetailPage({
  params,
}: {
  params: Promise<{ soId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { soId } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CreditDetailClient soId={soId} />
    </div>
  );
}
