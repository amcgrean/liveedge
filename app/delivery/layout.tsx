import { requirePageAccess } from '../../src/lib/access-control';

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('dispatch.view', 'dispatch.manage');
  return <>{children}</>;
}
