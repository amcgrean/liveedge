import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import { getSelectedBranchCode } from '@/lib/branch-context';
import {
  addParam,
  appendBranchItemFilter,
  formatProductLabel,
  isProductAdmin,
  parseIncludeInactive,
} from '../_shared';

type MajorRow = {
  code: string;
  label: string | null;
  item_count: number;
};

// GET /api/sales/products/groups
// Returns distinct product majors from agility_items, scoped to items that
// exist in agility_item_branch for the selected branch.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = isProductAdmin(session.user);
  const includeInactive = isAdmin && parseIncludeInactive(req.nextUrl.searchParams.get('includeInactive'));
  const effectiveBranch = isAdmin
    ? (await getSelectedBranchCode() ?? '')
    : (session.user.branch ?? '');

  try {
    const sql = getErpSql();

    const params: unknown[] = [];
    const where: string[] = [`NULLIF(product_major_code, '') IS NOT NULL`];
    appendBranchItemFilter(where, params, effectiveBranch, includeInactive);

    const rows = (await sql.unsafe(
      `SELECT product_major_code AS code,
              MAX(COALESCE(NULLIF(product_major, ''), product_major_code)) AS label,
              COUNT(DISTINCT item)::int AS item_count
       FROM public.agility_items
       WHERE ${where.join(' AND ')}
       GROUP BY product_major_code
       ORDER BY MAX(COALESCE(NULLIF(product_major, ''), product_major_code))`,
      params as never[]
    )) as MajorRow[];

    return NextResponse.json({
      groups: rows.map((r) => ({
        code: r.code,
        label: formatProductLabel(r.label ?? r.code),
        item_count: r.item_count,
      })),
      supportsMajor: true,
      supportsMinor: false,
    });
  } catch (err) {
    console.error('[sales/products/groups GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
