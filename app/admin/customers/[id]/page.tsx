import { Metadata } from 'next';
import { requirePageAccess } from '../../../../src/lib/access-control';
import CustomerDetailClient from './CustomerDetailClient';

export const metadata: Metadata = { title: 'Customer Detail | Admin | LiveEdge' };

export default async function CustomerDetailPage() {
  const session = await requirePageAccess('admin.customers.view', 'admin.config.manage');
  return <CustomerDetailClient session={session} />;
}
