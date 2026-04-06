import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import OpenPosClient from './OpenPosClient';

export default async function OpenPosPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'purchasing'].includes(r));

  if (!isAdmin && !(session.user.roles ?? []).some((r) => ['purchasing', 'warehouse'].includes(r))) {
    redirect('/purchasing');
  }

  return (
    <OpenPosClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
