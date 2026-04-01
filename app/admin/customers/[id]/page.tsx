import { Metadata } from 'next';
import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import CustomerDetailClient from './CustomerDetailClient';

export const metadata: Metadata = { title: 'Customer Detail | Admin | Beisser Takeoff' };

export default async function CustomerDetailPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <CustomerDetailClient session={session} />;
}
