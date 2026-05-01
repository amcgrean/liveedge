import { requirePageAccess } from '../../src/lib/access-control';

export default async function SupervisorLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('pickers.manage', 'workorders.assign');

  return <>{children}</>;
}
