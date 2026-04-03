import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { getErpSql } from '../../../../db/supabase';

// GET /api/sales/products?q=&branch=&limit=50
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const q = searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

  const isAdmin =
    session.user.role === 'admin' ||
    (session.user.roles ?? []).some((r) => ['admin', 'supervisor', 'ops', 'sales'].includes(r));

  const effectiveBranch = isAdmin
    ? (searchParams.get('branch') ?? '')
    : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    type ProductRow = {
      item_number: string;
      description: string | null;
      handling_code: string | null;
      system_id: string | null;
    };

    // Require at least 2 chars to avoid a full-table scan
    if (q.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const rows = await sql<ProductRow[]>`
      SELECT item AS item_number, MAX(description) AS description,
             MAX(handling_code) AS handling_code, MAX(system_id) AS system_id
      FROM agility_items
      WHERE is_deleted = false
        AND (item ILIKE ${'%' + q + '%'} OR description ILIKE ${'%' + q + '%'})
        ${effectiveBranch ? sql`AND system_id = ${effectiveBranch}` : sql``}
      GROUP BY item
      ORDER BY item
      LIMIT ${limit}
    `;

    return NextResponse.json({ products: rows });
  } catch (err) {
    console.error('[sales/products GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
