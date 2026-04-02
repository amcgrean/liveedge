import { redirect } from 'next/navigation';
import { auth } from '../../auth';

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const canAccess =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) =>
      ['admin', 'supervisor', 'ops', 'warehouse', 'sales'].includes(r)
    );

  if (!canAccess) redirect('/dashboard');

  return <>{children}</>;
}
