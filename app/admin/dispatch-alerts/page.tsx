import { requirePageAccess } from '../../../src/lib/access-control';
import DispatchAlertsClient from './DispatchAlertsClient';

export const metadata = { title: 'Dispatch Alerts | LiveEdge' };

export default async function DispatchAlertsPage() {
  await requirePageAccess('admin.config.manage');
  return <DispatchAlertsClient />;
}
