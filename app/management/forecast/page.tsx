import { requirePageAccess } from '../../../src/lib/access-control';
import { hasCapability } from '../../../src/lib/access-control-shared';
import ForecastClient from './ForecastClient';

export const metadata = { title: 'Forecast — Beisser LiveEdge' };

export default async function ForecastPage() {
  const session = await requirePageAccess('branch.all');

  const isAdmin = hasCapability(session, 'branch.all');

  return <ForecastClient isAdmin={isAdmin} userBranch={session.user.branch ?? null} />;
}
