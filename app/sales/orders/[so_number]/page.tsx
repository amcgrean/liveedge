import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../../src/components/nav/TopNav';
import OrderDetailClient from './OrderDetailClient';

type Props = { params: Promise<{ so_number: string }> };

export async function generateMetadata({ params }: Props) {
  const { so_number } = await params;
  return { title: `Order ${so_number}` };
}

export default async function OrderDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { so_number } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <OrderDetailClient soNumber={so_number} />
    </div>
  );
}
