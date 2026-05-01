import { requirePageAccess } from '../../../src/lib/access-control';
import AnalyticsClient from './AnalyticsClient';

export const metadata = { title: 'Page Analytics | LiveEdge Admin' };

export default async function AnalyticsPage() {
  await requirePageAccess('admin.config.manage');
  return <AnalyticsClient />;
}
