// Aggregate picker performance query for /api/warehouse/picker-stats.
//
// Extracted so the heavy GROUP BY + AVG(epoch) can sit behind erpCache and be
// shared across concurrent requests within the 5-minute window.
// The "today_picks" column uses CURRENT_DATE (DB-server time), which means a
// cache entry made at 11:58 PM will briefly show the prior day's today-count
// until it expires at 12:03 AM — acceptable for an analytics page.
//
// IMPORTANT: do NOT add .catch() inside _fetchPickerStats — let failures throw
// so erpCache never caches a partial result.

import { getErpSql } from '../../../db/supabase';
import { erpCache } from '../erp-cache';

export interface PickerStat {
  picker_id: number;
  picker_name: string;
  user_type: string | null;
  total_picks: number;
  today_picks: number;
  avg_minutes: number | null;
}

async function _fetchPickerStats(days: number): Promise<{ stats: PickerStat[]; days: number }> {
  const clampedDays = Math.max(1, Math.min(365, days));
  const since = new Date(Date.now() - clampedDays * 86_400_000).toISOString().slice(0, 10);

  const sql = getErpSql();

  type StatRow = {
    picker_id: number;
    picker_name: string;
    user_type: string | null;
    total_picks: number;
    today_picks: number;
    avg_minutes: number | null;
  };

  const rows = await sql<StatRow[]>`
    SELECT
      ps.id                                                        AS picker_id,
      ps.name                                                      AS picker_name,
      ps.user_type,
      COUNT(p.id)::int                                             AS total_picks,
      COUNT(CASE WHEN p.completed_time::date = CURRENT_DATE THEN 1 END)::int AS today_picks,
      ROUND(
        AVG(
          EXTRACT(EPOCH FROM (p.completed_time - p.start_time)) / 60.0
        )::numeric, 1
      )                                                            AS avg_minutes
    FROM pickster ps
    LEFT JOIN pick p
      ON p.picker_id = ps.id
      AND p.completed_time IS NOT NULL
      AND p.completed_time::date >= ${since}::date
    GROUP BY ps.id, ps.name, ps.user_type
    ORDER BY total_picks DESC
  `;

  return { stats: rows, days: clampedDays };
}

export const fetchPickerStats = erpCache(_fetchPickerStats, ['warehouse-picker-stats']);
