import { requirePageAccess } from '../../../../../src/lib/access-control';
import PermissionsClient from './PermissionsClient';

export const metadata = { title: 'User Permissions | LiveEdge' };

export default async function PermissionsPage() {
  await requirePageAccess('admin.users.manage');
  return <PermissionsClient />;
}
