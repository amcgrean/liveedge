import { requirePageAccess } from '../../src/lib/access-control';
import { TopNav } from '../../src/components/nav/TopNav';

export const metadata = { title: 'Customer Scorecard — Beisser LiveEdge' };
export const maxDuration = 60;

export default async function ScorecardLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageAccess('sales.view');
  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={(session.user as { role?: string }).role} />
      <main>{children}</main>
    </div>
  );
}
