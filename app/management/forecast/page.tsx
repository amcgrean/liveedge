import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { TopNav } from '../../../src/components/nav/TopNav';
import ForecastClient from './ForecastClient';

export const metadata = { title: 'Forecast — Beisser LiveEdge' };

export default async function ForecastPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = (session.user as { role?: string }).role ?? '';
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  const canSee =
    role === 'admin' ||
    ['admin', 'supervisor', 'ops', 'sales', 'dispatch', 'management'].some((r) => roles.includes(r));
  if (!canSee) redirect('/');

  const isAdmin = role === 'admin' || roles.some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={role} />
      <ForecastClient isAdmin={isAdmin} userBranch={session.user.branch ?? null} />
    </div>
  );
}
