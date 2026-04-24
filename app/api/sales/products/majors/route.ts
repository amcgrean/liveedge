import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import {
  addParam,
  appendBaseProductFilters,
  formatProductLabel,
  getAgilityItemColumns,
  getGroupColumn,
  getProductCapabilities,
  isProductAdmin,
  parseGroupSource,
  parseIncludeInactive,
  resolveGroupSource,
} from '../_shared';

type MajorRow = {
  code: string;
  label: string | null;
  item_count: number;
};

// GET /api/sales/products/majors?group=LBR&branch=20GR
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const group = searchParams.get('group')?.trim() ?? '';
  if (!group) return NextResponse.json({ error: 'Missing group' }, { status: 400 });

  const isAdmin = isProductAdmin(session.user);
  const includeInactive = isAdmin && parseIncludeInactive(searchParams.get('includeInactive'));
  const effectiveBranch = isAdmin
    ? (searchParams.get('branch')?.trim() ?? '')
    : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const columns = await getAgilityItemColumns(sql);
    const capabilities = getProductCapabilities(columns);

    if (!capabilities.hasMajor) {
      return NextResponse.json({
        majors: [],
        available: false,
      });
    }

    const groupSource =
      parseGroupSource(searchParams.get('groupSource')) ??
      (await resolveGroupSource(sql, effectiveBranch, includeInactive));

    const params: unknown[] = [];
    const where: string[] = [];
    appendBaseProductFilters(where, params, effectiveBranch, includeInactive);
    where.push(`${getGroupColumn(groupSource)} = ${addParam(params, group)}`);
    where.push(`NULLIF(product_major_code, '') IS NOT NULL`);

    const rows = (await sql.unsafe(
      `SELECT product_major_code AS code,
              COALESCE(MAX(NULLIF(product_major, '')), product_major_code) AS label,
              COUNT(DISTINCT item)::int AS item_count
       FROM public.agility_items
       WHERE ${where.join(' AND ')}
       GROUP BY product_major_code
       ORDER BY label, product_major_code`,
      params as never[]
    )) as MajorRow[];

    return NextResponse.json({
      majors: rows.map((row) => ({
        code: row.code,
        label: row.label ? formatProductLabel(row.label) : formatProductLabel(row.code),
        item_count: row.item_count,
      })),
      available: true,
      groupSource,
    });
  } catch (err) {
    console.error('[sales/products/majors GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
