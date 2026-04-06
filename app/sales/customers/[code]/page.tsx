import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../../../src/components/nav/TopNav';
import CustomerProfileClient from './CustomerProfileClient';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  return { title: `Customer ${code}` };
}

export default async function CustomerProfilePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const { code } = await params;

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CustomerProfileClient
        code={code.toUpperCase()}
        userName={session.user.name ?? ''}
      />
    </div>
  );
}
