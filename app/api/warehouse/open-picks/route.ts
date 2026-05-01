import { NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/warehouse/open-picks?branch=
// Returns picks grouped by picker (from local pick + pickster tables)
export async function GET() {
  const authResult = await requireCapability('yard.view', 'picks.release', 'workorders.assign', 'pickers.manage');
  if (authResult instanceof NextResponse) return authResult;

  // open-picks is purely from local tables (pick, pickster); no branch filter needed for pickers
  try {
    const sql = getErpSql();

    type PickRow = {
      pick_id: number;
      picker_id: number;
      picker_name: string;
      user_type: string | null;
      barcode_number: string | null;
      start_time: string | null;
      pick_type_id: number | null;
    };

    type CountRow = {
      picker_id: number;
      picker_name: string;
      user_type: string | null;
      today_count: number;
      five_day_count: number;
    };

    const [activeRows, countRows] = await Promise.all([
      sql<PickRow[]>`
        SELECT
          p.id         AS pick_id,
          p.picker_id,
          ps.name      AS picker_name,
          ps.user_type,
          p.barcode_number,
          p.start_time ::text AS start_time,
          p.pick_type_id
        FROM pick p
        JOIN pickster ps ON ps.id = p.picker_id
        WHERE p.completed_time IS NULL
        ORDER BY p.start_time ASC
      `,
      sql<CountRow[]>`
        SELECT
          ps.id        AS picker_id,
          ps.name      AS picker_name,
          ps.user_type,
          COUNT(CASE WHEN p.completed_time::date = (NOW() AT TIME ZONE 'America/Chicago')::date THEN 1 END)::int   AS today_count,
          COUNT(CASE WHEN p.completed_time::date >= (NOW() AT TIME ZONE 'America/Chicago')::date - 4 THEN 1 END)::int AS five_day_count
        FROM pickster ps
        LEFT JOIN pick p ON p.picker_id = ps.id AND p.completed_time IS NOT NULL
        GROUP BY ps.id, ps.name, ps.user_type
        ORDER BY ps.name
      `,
    ]);

    // Group active picks by picker
    const activeBypickerId = activeRows.reduce<Record<number, PickRow[]>>((acc, r) => {
      (acc[r.picker_id] ??= []).push(r);
      return acc;
    }, {});

    const pickers = countRows.map((c) => ({
      picker_id: c.picker_id,
      picker_name: c.picker_name,
      user_type: c.user_type,
      today_count: c.today_count,
      five_day_count: c.five_day_count,
      active_picks: activeBypickerId[c.picker_id] ?? [],
    }));

    return NextResponse.json({ pickers });
  } catch (err) {
    console.error('[warehouse/open-picks GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
