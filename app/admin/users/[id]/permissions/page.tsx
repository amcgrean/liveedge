import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import PermissionsClient from './PermissionsClient';

export const metadata = { title: 'User Permissions | Beisser Admin' };

export default async function PermissionsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'estimator';
  if (role !== 'admin') redirect('/dashboard');
  return <PermissionsClient />;
}
