import { requirePageAccess } from '../../src/lib/access-control';
import { TopNav } from '../../src/components/nav/TopNav';

export const metadata = { title: 'Management — Beisser LiveEdge' };

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageAccess('branch.all');
  return (
    <div className="min-h-screen bg-gray-950">
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <main>{children}</main>
    </div>
  );
}
