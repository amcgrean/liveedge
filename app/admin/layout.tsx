import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/');
  return <AdminLayoutClient session={session}>{children}</AdminLayoutClient>;
}
