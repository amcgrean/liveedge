import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getDb } from '../../../../db/index';

// GET /api/admin/analytics?limit=50&sort=visits
// Returns page visit stats by user from bids.page_visits
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const sort  = searchParams.get('sort') ?? 'visits';  // 'visits' | 'recent'
  const limit = Math.min(500, parseInt(searchParams.get('limit') ?? '200', 10) || 200);

  try {
    const db = getDb();

    // Raw SQL via drizzle's execute — bids.page_visits joined to public.app_users
    // page_visits.user_id is TEXT storing the app_users.id (integer) as a string
    type PageRow = {
      path: string;
      user_id: string;
      username: string | null;
      full_name: string | null;
      visit_count: number;
      last_visited_at: string | null;
    };

    const orderExpr = sort === 'recent'
      ? 'ORDER BY pv.last_visited_at DESC NULLS LAST'
      : 'ORDER BY pv.visit_count DESC';

    const rows = await db.execute<PageRow>(
      `SELECT
         pv.path,
         pv.user_id,
         au.username,
         au.display_name AS full_name,
         pv.visit_count,
         pv.last_visited_at::text
       FROM bids.page_visits pv
       LEFT JOIN public.app_users au ON au.id::text = pv.user_id
       ${orderExpr}
       LIMIT ${limit}`
    );

    // Aggregate: top pages overall
    const byPath = new Map<string, { path: string; total_visits: number; unique_users: number }>();
    for (const r of rows) {
      const cur = byPath.get(r.path) ?? { path: r.path, total_visits: 0, unique_users: 0 };
      cur.total_visits += Number(r.visit_count);
      cur.unique_users += 1;
      byPath.set(r.path, cur);
    }
    const topPages = [...byPath.values()]
      .sort((a, b) => b.total_visits - a.total_visits)
      .slice(0, 20);

    // Aggregate: top users by total visits
    const byUser = new Map<string, { user_id: string; username: string | null; full_name: string | null; total_visits: number; pages_visited: number }>();
    for (const r of rows) {
      const cur = byUser.get(r.user_id) ?? {
        user_id: r.user_id, username: r.username, full_name: r.full_name,
        total_visits: 0, pages_visited: 0,
      };
      cur.total_visits += Number(r.visit_count);
      cur.pages_visited += 1;
      byUser.set(r.user_id, cur);
    }
    const topUsers = [...byUser.values()]
      .sort((a, b) => b.total_visits - a.total_visits)
      .slice(0, 20);

    return NextResponse.json({
      rows,
      topPages,
      topUsers,
      total: rows.length,
    });
  } catch (err) {
    console.error('[admin/analytics GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
