import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/warehouse/picker-stats?days=30
// Returns aggregate pick performance per picker
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('pickers.manage', 'yard.view');
  if (authResult instanceof NextResponse) return authResult;

  const days = Math.max(1, Math.min(365, parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10) || 30));

  try {
    const sql = getErpSql();
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

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

    return NextResponse.json({ stats: rows, days });
  } catch (err) {
    console.error('[warehouse/picker-stats GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
