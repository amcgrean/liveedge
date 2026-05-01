import { requirePageAccess } from '../../src/lib/access-control';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('sales.view');
  return <>{children}</>;
}
