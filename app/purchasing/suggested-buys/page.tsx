import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import SuggestedBuysClient from './SuggestedBuysClient';

export default async function SuggestedBuysPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'purchasing'].includes(r));

  return (
    <SuggestedBuysClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
