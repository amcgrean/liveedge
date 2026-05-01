import { getErpSql } from '../../db/supabase';

export interface ActivePick {
  pick_id: number;
  picker_id: number;
  picker_name: string;
  barcode_number: string | null;
  start_time: string | null;
}

export interface PickerSummary {
  picker_id: number;
  picker_name: string;
  user_type: string | null;
  today_count: number;
  five_day_count: number;
  active_picks: ActivePick[];
}

export async function fetchOpenPickers(): Promise<PickerSummary[]> {
  const sql = getErpSql();

  type PickRow = {
    pick_id: number;
    picker_id: number;
    picker_name: string;
    user_type: string | null;
    barcode_number: string | null;
    start_time: string | null;
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
        p.id AS pick_id,
        p.picker_id,
        ps.name AS picker_name,
        ps.user_type,
        p.barcode_number,
        p.start_time::text AS start_time
      FROM pick p
      JOIN pickster ps ON ps.id = p.picker_id
      WHERE p.completed_time IS NULL
      ORDER BY p.start_time ASC
    `,
    sql<CountRow[]>`
      SELECT
        ps.id AS picker_id,
        ps.name AS picker_name,
        ps.user_type,
        COUNT(CASE WHEN p.completed_time::date = (NOW() AT TIME ZONE 'America/Chicago')::date THEN 1 END)::int AS today_count,
        COUNT(CASE WHEN p.completed_time::date >= (NOW() AT TIME ZONE 'America/Chicago')::date - 4 THEN 1 END)::int AS five_day_count
      FROM pickster ps
      LEFT JOIN pick p ON p.picker_id = ps.id AND p.completed_time IS NOT NULL
      GROUP BY ps.id, ps.name, ps.user_type
      ORDER BY ps.name
    `,
  ]);

  const activeByPickerId = activeRows.reduce<Record<number, ActivePick[]>>((acc, row) => {
    (acc[row.picker_id] ??= []).push(row);
    return acc;
  }, {});

  return countRows.map((row) => ({
    picker_id: row.picker_id,
    picker_name: row.picker_name,
    user_type: row.user_type,
    today_count: row.today_count,
    five_day_count: row.five_day_count,
    active_picks: activeByPickerId[row.picker_id] ?? [],
  }));
}
