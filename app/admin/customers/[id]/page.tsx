import { Metadata } from 'next';
import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import CustomerDetailClient from './CustomerDetailClient';

export const metadata: Metadata = { title: 'Customer Detail | Admin | LiveEdge' };

export default async function CustomerDetailPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = (session.user as { role?: string }).role ?? 'viewer';
  if (role !== 'admin') redirect('/');
  return <CustomerDetailClient session={session} />;
}
