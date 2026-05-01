import { requirePageAccess } from '../../../src/lib/access-control';
import AuditClient from './AuditClient';

export const metadata = { title: 'Audit Log | LiveEdge' };

export default async function AuditPage() {
  await requirePageAccess('admin.audit.view');
  return <AuditClient />;
}
