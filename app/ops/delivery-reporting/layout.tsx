import { requirePageAccess } from '../../../src/lib/access-control';

export default async function OpsDeliveryReportingLayout({ children }: { children: React.ReactNode }) {
  await requirePageAccess('dispatch.manage');
  return <>{children}</>;
}
