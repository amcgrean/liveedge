import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

export interface BranchStats {
  system_id: string;
  open_picks: number;
  open_work_orders: number;
  handling_breakdown: Record<string, number>;
  updated_at: string;
}

// GET /api/warehouse/stats
// Returns dashboard_stats rows. Non-admin users get their branch only.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops'].includes(r));

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

    const result: BranchStats[] = rows.map((r) => ({
      system_id: r.system_id,
      open_picks: r.open_picks ?? 0,
      open_work_orders: r.open_work_orders ?? 0,
      handling_breakdown: (() => {
        try { return JSON.parse(r.handling_breakdown_json ?? '{}') as Record<string, number>; }
        catch { return {}; }
      })(),
      updated_at: r.updated_at,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[warehouse/stats GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
