import { auth } from '../../auth';
import { redirect } from 'next/navigation';
import { getErpSql } from '../../db/supabase';
import WarehouseClient from './WarehouseClient';

interface BranchStats {
  system_id: string;
  open_picks: number;
  open_work_orders: number;
  handling_breakdown: Record<string, number>;
  updated_at: string;
}

export default async function WarehousePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

  let stats: BranchStats[] = [];
  try {
    const sql = getErpSql();

    type RawRow = {
      system_id: string;
      open_picks: number;
      open_work_orders: number;
      handling_breakdown_json: string;
      updated_at: string;
    };

    let rows: RawRow[];
    if (isAdmin || !session.user.branch) {
      rows = await sql<RawRow[]>`
        SELECT system_id, open_picks, open_work_orders, handling_breakdown_json, updated_at
        FROM dashboard_stats
        WHERE system_id != '' AND system_id != 'SYSTEM'
        ORDER BY system_id
      `;
    } else {
      rows = await sql<RawRow[]>`
        SELECT system_id, open_picks, open_work_orders, handling_breakdown_json, updated_at
        FROM dashboard_stats
        WHERE system_id = ${session.user.branch}
      `;
    }

    stats = rows.map((r) => ({
      system_id: r.system_id,
      open_picks: r.open_picks ?? 0,
      open_work_orders: r.open_work_orders ?? 0,
      handling_breakdown: (() => {
        try { return JSON.parse(r.handling_breakdown_json ?? '{}') as Record<string, number>; }
        catch { return {}; }
      })(),
      updated_at: String(r.updated_at),
    }));
  } catch (err) {
    console.error('[warehouse page] Failed to load stats:', err);
  }

  return (
    <WarehouseClient
      initialStats={stats}
      isAdmin={isAdmin}
      userBranch={session.user.branch ?? null}
      userName={session.user.name ?? null}
      userRole={session.user.role}
    />
  );
}
