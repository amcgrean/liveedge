import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import CustomerBidsClient from './CustomerBidsClient';

export const metadata = { title: 'Customer Bids | Beisser Takeoff' };

export default async function CustomerBidsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <CustomerBidsClient session={session} />;
}
