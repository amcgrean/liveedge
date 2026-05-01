import { requirePageAccess } from '../../src/lib/access-control';
import AdminLayoutClient from './AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageAccess(
    'admin.users.manage',
    'admin.config.manage',
    'admin.audit.view',
    'admin.jobs.review',
    'admin.products.view',
    'admin.customers.view',
    'hubbell.review',
  );
  return <AdminLayoutClient session={session}>{children}</AdminLayoutClient>;
}
