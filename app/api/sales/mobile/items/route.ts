import { NextRequest, NextResponse } from 'next/server';
import { requireSessionOrMobile } from '../../../../../src/lib/mobile-auth';
import { hasCapability } from '../../../../../src/lib/access-control';
import { getErpSql } from '../../../../../db/supabase';
import type { MobileItem } from '../_shared';

// GET /api/sales/mobile/items?q=&branch=&limit=50
// Mirror-backed item search + per-branch on-hand. Live price/availability is
// Phase 2 (agilityApi.itemPriceAndAvailability) — `price` is null here.
export async function GET(req: NextRequest) {
  const authResult = await requireSessionOrMobile(req, 'sales.view');
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const { searchParams } = req.nextUrl;
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10) || 50);

  const isAdmin = hasCapability(session, 'branch.all');
  const branch = isAdmin
    ? (searchParams.get('branch') ?? session.user.branch ?? '')
    : (session.user.branch ?? '');

  // On-hand is per-branch (agility_item_branch.system_id); without a branch
  // there's no meaningful availability to return.
  if (!branch) return NextResponse.json({ items: [] });

  try {
    const sql = getErpSql();

    type Row = {
      item: string;
      description: string | null;
      stocking_uom: string | null;
      qty_on_hand: number | null;
    };

    const rows = await sql<Row[]>`
      SELECT
        ai.item,
        ai.description,
        ai.stocking_uom,
        bi.qty_on_hand::float8 AS qty_on_hand
      FROM agility_items ai
      JOIN agility_item_branch bi
        ON bi.item_code = ai.item
        AND bi.system_id = ${branch}
        AND bi.is_deleted = false
        AND bi.active_flag = true
      WHERE ai.is_deleted = false
        ${q ? sql`AND (ai.item ILIKE ${'%' + q + '%'} OR COALESCE(ai.description,'') ILIKE ${'%' + q + '%'})` : sql``}
      ORDER BY ai.description ASC NULLS LAST
      LIMIT ${limit}
    `;

    const items: MobileItem[] = rows.map((r) => {
      const onhand = r.qty_on_hand ?? 0;
      return {
        code: r.item,
        description: r.description,
        uom: r.stocking_uom,
        qty_on_hand: onhand,
        stock: onhand > 0 ? 'in' : 'out',
        price: null,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error('[sales/mobile/items GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
