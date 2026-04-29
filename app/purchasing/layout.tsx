import { redirect } from 'next/navigation';
import { auth } from '../../auth';

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const roles = session.user.roles ?? [];
  // Allow: admin, estimator (ops staff), or users with purchasing role
  const canAccess =
    session.user.role === 'admin' ||
    session.user.role === 'management' ||
    session.user.role === 'estimator' ||
    roles.includes('purchasing') ||
    roles.includes('receiving_yard') ||
    roles.some((r) => ['admin', 'supervisor', 'ops', 'purchasing', 'warehouse'].includes(r));
  if (!canAccess) redirect('/');
  return <>{children}</>;
}
