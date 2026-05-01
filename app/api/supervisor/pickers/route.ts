import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';
import { businessMinutesElapsed } from '@/lib/central-time';

export interface PickerStatus {
  id: number;
  name: string;
  user_type: string;
  status: 'active' | 'assigned' | 'idle';
  current_task: string | null;
  task_type: string | null;
  active_duration_min: number;
}

export interface RecentPick {
  id: number;
  picker_name: string;
  so_number: string;
  start_time: string | null;
  completed_time: string | null;
}

// GET /api/supervisor/pickers
export async function GET() {
  const authResult = await requireCapability('pickers.manage', 'workorders.assign');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const sql = getErpSql();

    // Run all 5 independent queries in parallel
    const [pickers, activePicks, pickAssignments, woAssignments, recentPicks] = await Promise.all([
      sql<{ id: number; name: string; user_type: string }[]>`
        SELECT id, name, user_type FROM pickster ORDER BY name
      `,
      sql<{ picker_id: number; barcode_number: string; start_time: string | null }[]>`
        SELECT picker_id, barcode_number, start_time
        FROM pick
        WHERE completed_time IS NULL
      `,
      sql<{ picker_id: number; so_number: string }[]>`
        SELECT picker_id, so_number FROM pick_assignments
      `,
      sql<{ assigned_to_id: number; work_order_number: string; sales_order_number: string }[]>`
        SELECT assigned_to_id, work_order_number, sales_order_number
        FROM work_orders
        WHERE assigned_to_id IS NOT NULL AND completed_at IS NULL AND status != 'Complete'
      `,
      sql<{ id: number; picker_id: number; picker_name: string; barcode_number: string; start_time: string | null; completed_time: string | null }[]>`
        SELECT p.id, p.picker_id, pk.name AS picker_name, p.barcode_number, p.start_time::text, p.completed_time::text
        FROM pick p
        JOIN pickster pk ON pk.id = p.picker_id
        WHERE p.completed_time IS NOT NULL
        ORDER BY p.completed_time DESC
        LIMIT 10
      `,
    ]);

    // Build maps
    const activeMap = new Map(activePicks.map((a) => [a.picker_id, a]));
    const pickAssignMap = new Map(pickAssignments.map((a) => [a.picker_id, a.so_number]));
    const woAssignMap = new Map(woAssignments.map((a) => [a.assigned_to_id, a]));

    const pickerStatuses: PickerStatus[] = pickers.map((p) => {
      const active = activeMap.get(p.id);
      if (active) {
        const durationMin = active.start_time
          ? businessMinutesElapsed(active.start_time)
          : 0;
        return {
          id: p.id,
          name: p.name,
          user_type: p.user_type,
          status: 'active',
          current_task: active.barcode_number,
          task_type: 'Pick',
          active_duration_min: durationMin,
        };
      }
      const pickSo = pickAssignMap.get(p.id);
      if (pickSo) {
        return { id: p.id, name: p.name, user_type: p.user_type, status: 'assigned', current_task: pickSo, task_type: 'Pick', active_duration_min: 0 };
      }
      const wo = woAssignMap.get(p.id);
      if (wo) {
        return { id: p.id, name: p.name, user_type: p.user_type, status: 'assigned', current_task: wo.work_order_number, task_type: 'Production (WO)', active_duration_min: 0 };
      }
      return { id: p.id, name: p.name, user_type: p.user_type, status: 'idle', current_task: null, task_type: null, active_duration_min: 0 };
    });

    return NextResponse.json({
      pickers: pickerStatuses,
      recent_picks: recentPicks,
    });
  } catch (err) {
    console.error('[supervisor/pickers GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
