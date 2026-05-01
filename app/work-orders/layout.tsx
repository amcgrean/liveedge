import { requirePageAccess } from '../../src/lib/access-control';

export default async function WorkOrdersLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('workorders.assign', 'yard.view');

  return <>{children}</>;
}
