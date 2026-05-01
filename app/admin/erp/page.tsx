import { requirePageAccess } from '../../../src/lib/access-control';
import ERPClient from './ERPClient';

export const metadata = { title: 'ERP Sync | LiveEdge' };

export default async function ERPPage() {
  await requirePageAccess('admin.config.manage');
  return <ERPClient />;
}
