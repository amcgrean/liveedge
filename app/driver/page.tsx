import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import DriverHomeClient from './DriverHomeClient';

export const metadata = { title: 'Driver — LiveEdge' };

export default async function DriverHomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <DriverHomeClient driverName={session.user.name ?? ''} branch={session.user.branch ?? ''} />;
}
