import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { TopNav } from '../../src/components/nav/TopNav';
import CreditsClient from './CreditsClient';

export const metadata = { title: 'RMA Credits' };

export default async function CreditsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role    = (session.user as { role?: string }).role ?? 'estimator';
  const roles   = (session.user as { roles?: string[] }).roles ?? [];
  const isAdmin = role === 'admin' || roles.some((r) => ['admin', 'supervisor', 'ops'].includes(r));
  const userBranch = (session.user as { branch?: string }).branch ?? '';

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={role} />
      <CreditsClient userBranch={userBranch} isAdmin={isAdmin} />
    </div>
  );
}
