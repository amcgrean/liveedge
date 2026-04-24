import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { TopNav } from '../../src/components/nav/TopNav';

export const metadata = { title: 'Management — Beisser LiveEdge' };

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = (session.user as { role?: string }).role;
  if (!['admin', 'management', 'sales', 'ops', 'supervisor'].includes(role ?? '')) {
    redirect('/');
  }
  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={role} />
      <main>{children}</main>
    </div>
  );
}
