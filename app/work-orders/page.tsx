import { requirePageAccess, hasCapability } from '../../src/lib/access-control';
import { getErpSql } from '../../db/supabase';
import WorkOrdersClient from './WorkOrdersClient';

interface Builder {
  id: number;
  name: string;
  user_type: string;
  branch_code: string | null;
}

export default async function WorkOrdersPage() {
  const session = await requirePageAccess('workorders.assign', 'yard.view');

  const isAdmin = hasCapability(session, 'branch.all');

  let builders: Builder[] = [];
  try {
    const sql = getErpSql();
    builders = await sql<Builder[]>`
      SELECT id, name, user_type, branch_code FROM pickster ORDER BY name
    `;
  } catch (err) {
    console.error('[work-orders page] Failed to load builders:', err);
  }

  return (
    <WorkOrdersClient
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      builders={builders}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
