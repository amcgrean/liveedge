import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { TopNav } from '../../src/components/nav/TopNav';

export const metadata = { title: 'Customer Scorecard — Beisser LiveEdge' };

export default async function ScorecardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={(session.user as { role?: string }).role} />
      <main>{children}</main>
    </div>
  );
}
