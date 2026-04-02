import { auth } from '../../auth';
import { getErpSql } from '../../db/supabase';
import WorkOrdersClient from './WorkOrdersClient';

interface Builder {
  id: number;
  name: string;
  user_type: string;
  branch_code: string | null;
}

export default async function WorkOrdersPage() {
  const session = await auth();
  const isAdmin =
    session!.user.role === 'admin' ||
    (session!.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  const sql = getErpSql();

  // Load builders for assignment dropdown
  const builders = await sql<Builder[]>`
    SELECT id, name, user_type, branch_code FROM pickster ORDER BY name
  `;

  return (
    <WorkOrdersClient
      isAdmin={isAdmin}
      userBranch={session!.user.branch ?? null}
      builders={builders}
    />
  );
}
