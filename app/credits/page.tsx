import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import CreditsClient from './CreditsClient';

export const metadata = { title: 'RMA Credits' };

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <CreditsClient />
    </div>
  );
}
