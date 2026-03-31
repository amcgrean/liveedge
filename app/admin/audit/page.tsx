import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AuditClient from './AuditClient';

export const metadata = { title: 'Audit Log | Beisser Admin' };

export default async function AuditPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/dashboard');
  return <AuditClient />;
}
