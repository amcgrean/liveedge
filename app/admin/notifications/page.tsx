import { requirePageAccess } from '../../../src/lib/access-control';
import NotificationsClient from './NotificationsClient';

export const metadata = { title: 'Notifications | LiveEdge' };

export default async function NotificationsPage() {
  await requirePageAccess('admin.config.manage');
  return <NotificationsClient />;
}
