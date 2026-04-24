import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import EstimatingHubClient from './EstimatingHubClient';

export const metadata = { title: 'Estimating | LiveEdge' };

export default async function EstimatingPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin = session.user.role === 'admin';

  return (
    <EstimatingHubClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role ?? 'estimator'}
    />
  );
}
