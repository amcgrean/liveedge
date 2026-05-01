import { requirePageAccess } from '../../src/lib/access-control';

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('purchasing.view', 'purchasing.receive', 'purchasing.review');
  return <>{children}</>;
}
