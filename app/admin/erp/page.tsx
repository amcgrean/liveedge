import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ERPClient from './ERPClient';

export const metadata = { title: 'ERP Sync | Beisser Admin' };

export default async function ERPPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/dashboard');
  return <ERPClient />;
}
