import { NextRequest, NextResponse } from 'next/server';
import { requireCapability, hasCapability } from '../../../../src/lib/access-control';
import { getErpSql } from '../../../../db/supabase';

// GET /api/purchasing/suggested-buys?branch=20GR&q=lumber&limit=200
export async function GET(req: NextRequest) {
  const authResult = await requireCapability('purchasing.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const isAdmin = hasCapability(session, 'branch.all');

  const branchParam = req.nextUrl.searchParams.get('branch') ?? '';
  const branch = isAdmin ? branchParam || null : (session.user.branch ?? null);
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '200', 10) || 200);

  try {
    const sql = getErpSql();

    const rows = await sql`
      SELECT
        sph.ppo_id,
        sph.system_id,
        sph.supplier_code,
        COALESCE(sph.supplier_name, sph.supplier_code)                     AS supplier_name,
        sph.created_date::text                                              AS order_date,
        MIN(spl.exp_rcpt_date)::text                                        AS expect_date,
        CASE WHEN sph.is_available THEN 'OPEN' ELSE 'PENDING' END          AS ppo_status,
        COUNT(spl.id)::int                                                  AS line_count,
        SUM(spl.qty_ordered)::numeric                                       AS total_qty
      FROM agility_suggested_po_header sph
      LEFT JOIN agility_suggested_po_lines spl
        ON spl.system_id = sph.system_id AND spl.ppo_id = sph.ppo_id AND spl.is_deleted = false
      WHERE sph.is_deleted = false
        ${branch ? sql`AND sph.system_id = ${branch}` : sql``}
        ${q ? sql`AND (sph.ppo_id::text ILIKE ${'%' + q + '%'} OR sph.supplier_code ILIKE ${'%' + q + '%'} OR sph.supplier_name ILIKE ${'%' + q + '%'})` : sql``}
      GROUP BY sph.ppo_id, sph.system_id, sph.supplier_code, sph.supplier_name,
               sph.created_date, sph.is_available
      ORDER BY MIN(spl.exp_rcpt_date) ASC NULLS LAST, sph.ppo_id
      LIMIT ${limit}
    `;

    return NextResponse.json({ suggestions: rows });
  } catch (err) {
    console.error('[purchasing/suggested-buys GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
