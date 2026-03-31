import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Dashboard | Beisser Lumber' };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <DashboardClient session={session} />;
}
