import { redirect } from 'next/navigation';
import { auth } from '../../auth';

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const canAccess =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) =>
      ['admin', 'supervisor', 'ops', 'dispatch', 'sales', 'warehouse', 'management'].includes(r)
    );
  if (!canAccess) redirect('/dashboard');

  return <>{children}</>;
}
