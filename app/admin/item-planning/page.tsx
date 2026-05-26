import { requirePageAccess } from '../../../src/lib/access-control';
import ItemPlanningClient from './ItemPlanningClient';

export const metadata = { title: 'Item Planning | LiveEdge' };

export default async function ItemPlanningPage() {
  const session = await requirePageAccess('admin.config.manage');
  return <ItemPlanningClient userName={session.user?.name ?? null} />;
}
