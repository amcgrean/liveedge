import { requirePageAccess, hasCapability } from '../../../src/lib/access-control';
import SuggestedBuysClient from './SuggestedBuysClient';

export default async function SuggestedBuysPage() {
  const session = await requirePageAccess('purchasing.view');

  const isAdmin = hasCapability(session, 'branch.all');

  return (
    <SuggestedBuysClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
