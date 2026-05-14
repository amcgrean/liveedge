import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import DriverHomeClient from './DriverHomeClient';
import { TopNav } from '@/components/nav/TopNav';

export const metadata = { title: 'Driver — LiveEdge' };

export default async function DriverHomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return (
    <>
      <TopNav userName={session.user.name} userRole={session.user.role} />
      <DriverHomeClient driverName={session.user.name ?? ''} branch={session.user.branch ?? ''} />
    </>
  );
}
