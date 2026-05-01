import { requirePageAccess } from '../../src/lib/access-control';

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');

  return <>{children}</>;
}
