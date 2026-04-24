import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { getErpSql } from '../../../../../db/supabase';
import {
  appendBaseProductFilters,
  formatProductLabel,
  getAgilityItemColumns,
  getGroupColumn,
  getProductCapabilities,
  isProductAdmin,
  parseIncludeInactive,
  resolveGroupSource,
} from '../_shared';

type GroupRow = {
  code: string;
  item_count: number;
};

// GET /api/sales/products/groups?branch=20GR
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const isAdmin = isProductAdmin(session.user);
  const includeInactive = isAdmin && parseIncludeInactive(searchParams.get('includeInactive'));
  const effectiveBranch = isAdmin
    ? (searchParams.get('branch')?.trim() ?? '')
    : (session.user.branch ?? '');

  try {
    const sql = getErpSql();
    const columns = await getAgilityItemColumns(sql);
    const capabilities = getProductCapabilities(columns);
    const groupSource = await resolveGroupSource(sql, effectiveBranch, includeInactive);
    const groupColumn = getGroupColumn(groupSource);

    const params: unknown[] = [];
    const where: string[] = [];
    appendBaseProductFilters(where, params, effectiveBranch, includeInactive);
    where.push(`NULLIF(${groupColumn}, '') IS NOT NULL`);

    const rows = (await sql.unsafe(
      `SELECT ${groupColumn} AS code,
              COUNT(DISTINCT item)::int AS item_count
       FROM public.agility_items
       WHERE ${where.join(' AND ')}
       GROUP BY ${groupColumn}
       ORDER BY ${groupColumn}`,
      params as never[]
    )) as GroupRow[];

    return NextResponse.json({
      groups: rows.map((row) => ({
        code: row.code,
        label: formatProductLabel(row.code),
        item_count: row.item_count,
      })),
      groupSource,
      supportsMajor: capabilities.hasMajor,
      supportsMinor: capabilities.hasMinor,
      hasPrimarySupplier: capabilities.hasPrimarySupplier,
      branch: effectiveBranch || null,
    });
  } catch (err) {
    console.error('[sales/products/groups GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
