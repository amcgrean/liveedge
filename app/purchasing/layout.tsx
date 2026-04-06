import { redirect } from 'next/navigation';
import { auth } from '../../auth';

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');
  // Viewers (no WH-Tracker role) cannot access purchasing
  if (session.user.role === 'viewer') redirect('/dashboard');
  return <>{children}</>;
}
