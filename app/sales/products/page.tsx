import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import ProductsClient from './ProductsClient';

export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user) redirect('/ops-login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  return (
    <ProductsClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
    />
  );
}
