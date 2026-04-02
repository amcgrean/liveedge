import { auth } from '../../auth';
import DispatchClient from './DispatchClient';

export default async function DispatchPage() {
  const session = await auth();
  const isAdmin =
    session!.user.role === 'admin' ||
    (session!.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  return (
    <DispatchClient
      isAdmin={isAdmin}
      userBranch={session!.user.branch ?? null}
    />
  );
}
